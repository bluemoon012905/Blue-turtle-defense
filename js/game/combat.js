// Combat — AI movement, targeting, attack resolution, pathfinding refresh

import { findPath }          from './pathfinding.js';
import { createProjectile }  from '../systems/factory.js';
import { decodeTower }       from '../systems/decoder.js';
import { TOWER_DEFINITION }  from '../data/towers.js';
import { TECH_TREE }         from '../data/tech.js';
import state                 from '../systems/gameState.js';

const TILE_SIZE = 20;  // keep in sync with main.js / map
const SPAWN_ZONE_HEAL_PER_SECOND = 0.6;

// ── Helpers ───────────────────────────────────────────────────────────────────

function dist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function moveToward(entity, tx, ty, speed, dt) {
  const dx = tx - entity.x;
  const dy = ty - entity.y;
  const d  = Math.sqrt(dx * dx + dy * dy);
  if (d < 2) return true;  // arrived
  const step = Math.min(speed * dt, d);
  entity.x += (dx / d) * step;
  entity.y += (dy / d) * step;
  return false;
}

// ── Enemy AI ─────────────────────────────────────────────────────────────────

export function updateEnemies(dt) {
  const fortress = state.buildings.find(b => b.isHq);
  const map = state.map;

  for (const enemy of state.enemies) {
    if (enemy.state === 'dead') continue;

    enemy.inSpawnZone = !!map && map.isInSpawnZoneWorld(enemy.x, enemy.y);
    if (enemy.inSpawnZone && enemy.hp < enemy.maxHp) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * SPAWN_ZONE_HEAL_PER_SECOND * dt);
    }

    // Attack cooldown
    if (enemy.attackCooldown > 0) enemy.attackCooldown -= dt;

    // Decide target: prefer nearby units, else fortress
    let attackTarget = null;

    // Check nearby units
    for (const unit of state.units) {
      if (unit.state === 'dead') continue;
      if (dist(enemy.x, enemy.y, unit.x, unit.y) <= 35) {
        attackTarget = unit;
        break;
      }
    }

    // Otherwise target fortress
    if (!attackTarget && fortress) {
      const fd = dist(enemy.x, enemy.y, fortress.px + fortress.w / 2, fortress.py + fortress.h / 2);
      if (fd <= 45) {
        attackTarget = fortress;
      }
    }

    if (attackTarget) {
      enemy.state = 'attacking';
      if (enemy.attackCooldown <= 0) {
        dealDamage(attackTarget, enemy.damage, enemy.attackType || 'melee');
        enemy.attackCooldown = 1 / enemy.attackSpeed;
      }
    } else {
      enemy.state = 'moving';
      followPath(enemy, dt);
    }
  }
}

function followPath(enemy, dt) {
  // If path is empty or stale, request a new one
  if (!enemy.path || enemy.pathIndex >= enemy.path.length) {
    refreshEnemyPath(enemy);
    return;
  }

  const waypoint = enemy.path[enemy.pathIndex];
  const arrived  = moveToward(enemy, waypoint.x, waypoint.y, enemy.speed, dt);
  if (arrived) enemy.pathIndex++;
}

function refreshEnemyPath(enemy) {
  const map = state.map;
  if (!map) return;

  const start = map.pixelToTile(enemy.x, enemy.y);
  let goalTx, goalTy;

  if (enemy.goalTile) {
    goalTx = enemy.goalTile.tx;
    goalTy = enemy.goalTile.ty;
  } else {
    const fortress = state.buildings.find(b => b.isHq);
    if (!fortress) return;
    goalTx = fortress.tileX + Math.floor(fortress.size / 2);
    goalTy = fortress.tileY + Math.floor(fortress.size / 2);
    enemy.goalTile = { tx: goalTx, ty: goalTy };
  }

  const path = findPath(map, start.tx, start.ty, goalTx, goalTy);
  if (path) {
    enemy.path      = path;
    enemy.pathIndex = 1;
  } else {
    // Fallback: direct movement toward goal pixel
    enemy.path      = [{ x: enemy.goalTile.tx * map.tileSize + map.tileSize / 2,
                         y: enemy.goalTile.ty * map.tileSize + map.tileSize / 2 }];
    enemy.pathIndex = 0;
  }
}

// Re-path all live enemies (called when a building is placed, changing walkability)
export function rePathAllEnemies() {
  for (const e of state.enemies) {
    if (e.state !== 'dead') {
      e.path      = [];
      e.pathIndex = 0;
    }
  }
}

// ── Unit AI ───────────────────────────────────────────────────────────────────

export function updateUnits(dt) {
  const fortress = state.buildings.find(b => b.isHq);
  if (!fortress) return;

  for (const unit of state.units) {
    if (unit.state === 'dead') continue;
    if (unit.attackCooldown > 0) unit.attackCooldown -= dt;

    // Find nearest enemy within detection radius (patrol + range)
    const detectR = unit.patrolRadius + unit.range;
    let nearest = null, nearestDist = Infinity;

    for (const en of state.enemies) {
      if (en.state === 'dead') continue;
      const d = dist(unit.x, unit.y, en.x, en.y);
      if (d < detectR && d < nearestDist) {
        nearest     = en;
        nearestDist = d;
      }
    }

    if (nearest) {
      // Move toward enemy if not in attack range
      if (nearestDist > unit.range) {
        unit.state   = 'moving';
        unit.targetX = nearest.x;
        unit.targetY = nearest.y;
        moveToward(unit, nearest.x, nearest.y, unit.speed, dt);
      } else {
        unit.state = 'attacking';
        if (unit.attackCooldown <= 0) {
          dealDamage(nearest, unit.damage, unit.attackType || 'melee');
          unit.attackCooldown = 1 / unit.attackSpeed;
        }
      }
    } else {
      // Return toward patrol centre if drifted
      const d = dist(unit.x, unit.y, unit.patrolCenterX, unit.patrolCenterY);
      if (d > unit.patrolRadius * 0.5) {
        unit.state = 'moving';
        moveToward(unit, unit.patrolCenterX, unit.patrolCenterY, unit.speed * 0.6, dt);
      } else {
        unit.state = 'idle';
      }
    }
  }
}

// ── Tower AI ──────────────────────────────────────────────────────────────────

export function updateTowers(dt) {
  const towers = state.buildings.filter(b => b.towerStats);

  for (const tower of towers) {
    if (tower.attackCooldown > 0) {
      tower.attackCooldown -= dt;
      continue;
    }

    const stats   = decodeTower(tower, TOWER_DEFINITION, TECH_TREE);
    const rangePx = stats.range * TILE_SIZE;
    const cx      = tower.px + tower.w / 2;
    const cy      = tower.py + tower.h / 2;

    // Collect enemies in range, sorted by distance
    const inRange = state.enemies
      .filter(e => e.state !== 'dead' && dist(cx, cy, e.x, e.y) <= rangePx)
      .sort((a, b) => dist(cx, cy, a.x, a.y) - dist(cx, cy, b.x, b.y));

    if (inRange.length === 0) continue;

    // Fire at up to projectileCount targets
    const targets = inRange.slice(0, stats.projectileCount);
    for (const target of targets) {
      const proj = createProjectile(
        cx, cy,
        target,
        stats.damage,
        stats.projectileSpeed || 250,
        stats.projectileColor,
        'pierce',
      );
      state.projectiles.push(proj);
    }

    tower.attackCooldown = 1 / stats.attackSpeed;
  }
}

// ── Projectiles ───────────────────────────────────────────────────────────────

export function updateProjectiles(dt) {
  for (const proj of state.projectiles) {
    if (proj.done) continue;
    const target = proj.target;
    if (!target || target.state === 'dead' || target.hp <= 0) {
      proj.done = true;
      continue;
    }

    const arrived = moveToward(proj, target.x, target.y, proj.speed, dt);
    if (arrived) {
      dealDamage(target, proj.damage, proj.damageType || 'pierce');
      proj.done = true;
    }
  }

  // Prune dead projectiles
  state.projectiles = state.projectiles.filter(p => !p.done);
}

// ── Damage & death ────────────────────────────────────────────────────────────

function dealDamage(target, rawDamage, damageType = 'melee') {
  const armor = damageType === 'pierce'
    ? (target.pierceArmor ?? target.armor ?? 0)
    : (target.meleeArmor ?? target.armor ?? 0);
  const shieldBlock = damageType === 'pierce'
    ? (target.shieldBlockPierce || 0)
    : (target.shieldBlockMelee || 0);
  const actual = Math.max(1, rawDamage - armor - shieldBlock);
  target.hp   -= actual;

  if (target.hp <= 0) {
    target.hp    = 0;
    target.state = 'dead';

    // If it's an enemy: award resources
    if (target.reward) {
      for (const [res, val] of Object.entries(target.reward)) {
        state.resources[res] = (state.resources[res] || 0) + val;
      }
    }
  }
}

// ── Resource generation ───────────────────────────────────────────────────────

export function updateResourceBuildings(dt) {
  for (const b of state.buildings) {
    for (const [res, rate] of Object.entries(b.generates || {})) {
      state.resources[res] = (state.resources[res] || 0) + rate * dt;
    }
  }
}

// ── Production queues ─────────────────────────────────────────────────────────

export function updateProductionQueues(dt) {
  for (const building of state.buildings) {
    if (!building.producesUnits) continue;
    if (!building.productionQueue.length) continue;

    const job = building.productionQueue[0];
    job.timeLeft -= dt;

    if (job.timeLeft <= 0) {
      building.productionQueue.shift();
      const unit = spawnUnit(job.unitConfig, building);
      if (unit) state.units.push(unit);
    }
  }
}

// ── Research ──────────────────────────────────────────────────────────────────

export function updateResearch(dt) {
  if (!state.researchQueue.length) return;
  const job = state.researchQueue[0];
  job.timeRemaining -= dt;

  if (job.timeRemaining <= 0) {
    state.researchQueue.shift();
    applyTechEffect(job.nodeId);
    state.researchedTech.add(job.nodeId);
  }
}

function applyTechEffect(nodeId) {
  const tech = TECH_TREE[nodeId];
  if (!tech) return;

  // Global unlocks
  if (tech.globalUnlock) {
    state.globalUnlocks.add(tech.globalUnlock);
  }

  // Equipment unlocks
  for (const eqId of (tech.unlocks || [])) {
    state.unlockedEquipment.add(eqId);
  }

  // Branch stat bonuses
  for (const eff of (tech.effects || [])) {
    if (eff.type === 'branch_stat') {
      const bonus = state.branchBonuses[eff.branch];
      if (bonus && bonus[eff.stat] !== undefined) {
        bonus[eff.stat] += eff.value;
      }
    }
    // tower_upgrade effects are per-tower; applied in decoder, not globally
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export function pruneDeadEntities() {
  state.enemies = state.enemies.filter(e => e.state !== 'dead');
  state.units   = state.units.filter(u => u.state !== 'dead');
}

// ── Inline unit spawning (avoids circular import with factory.js) ─────────────
const BRANCH_COLOURS = {
  infantry: { label: 'Infantry', color: '#42A5F5' },
};

function spawnUnit(cfg, src) {
  const branchDef = BRANCH_COLOURS[cfg.branch] || {};
  const sx = src.px + src.w / 2 + (Math.random() - 0.5) * 24;
  const sy = src.py + src.h + 10;
  return {
    id:             state._nextId++,
    branch:         cfg.branch,
    name:           branchDef.label || 'Soldier',
    color:          branchDef.color || '#42A5F5',
    size:           10,
    x: sx, y: sy,
    maxHp:          cfg.hp,
    hp:             cfg.hp,
    damage:         cfg.damage,
    meleeArmor:     cfg.meleeArmor,
    pierceArmor:    cfg.pierceArmor,
    shieldBlockMelee: cfg.shieldBlockMelee,
    shieldBlockPierce: cfg.shieldBlockPierce,
    armor:          Math.floor((cfg.meleeArmor + cfg.pierceArmor) / 2),
    range:          cfg.range * 32,
    speed:          cfg.speed,
    attackSpeed:    cfg.attackSpeed,
    attackType:     cfg.attackType,
    attackCooldown: 0,
    state:          'idle',
    target:         null, targetX: null, targetY: null,
    patrolCenterX:  sx,
    patrolCenterY:  sy,
    patrolRadius:   80,
    pop:            cfg.pop,
    weaponId:       cfg.weaponId || null,
    shieldId:       cfg.shieldId || null,
    armorId:        cfg.armorId || null,
  };
}
