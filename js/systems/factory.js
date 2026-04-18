// Factory — creates runtime entity instances from decoded configs

import state from './gameState.js';
import { BUILDING_DEFINITIONS } from '../data/buildings.js';
import { STARTING_EQUIPMENT, UNIT_BRANCHES } from '../data/soldiers.js';
import { ENEMY_DEFINITIONS } from '../data/enemies.js';
import { TOWER_DEFINITION } from '../data/towers.js';

const FORTRESS_RANGED_DEFINITION = {
  ...TOWER_DEFINITION,
  id: 'fortress',
  name: 'Fortress Ballista',
  damage: 14,
  attackSpeed: 0.65,
  range: 7,
  projectileCount: 1,
  projectileSpeed: 300,
};

export function createBuilding(defId, tileX, tileY, tileSize) {
  const def = BUILDING_DEFINITIONS[defId];
  if (!def) return null;

  const px = tileX * tileSize;
  const py = tileY * tileSize;
  const w  = def.size * tileSize;

  const inst = {
    id:        state.nextId(),
    defId,
    name:      def.name,
    tileX, tileY,
    px, py,
    w, h: w,
    maxHp:     def.maxHp,
    hp:        def.maxHp,
    color:     def.color,
    size:      def.size,
    isHq:      def.isHq || false,

    // Production
    producesUnits: def.producesUnits || false,
    trainableUnits: def.trainableUnits || [],
    productionQueue: [],  // [{ unitConfig, timeLeft, totalTime }]
    loadoutSelection: {
      weaponId: STARTING_EQUIPMENT[0] || null,
      shieldId: null,
      armorId: null,
    },

    // Tower extras
    chosenUpgrades: [],
    attackCooldown: 0,

    // Resource generation
    generates: { ...(def.generates || {}) },
    popCapBonus: def.popCapBonus || 0,
  };

  // Give ranged defenses a dedicated stats cache (refreshed by decoder on upgrade)
  if (defId === 'tower') {
    inst.towerStats = { ...TOWER_DEFINITION };
  }
  if (defId === 'fortress') {
    inst.towerStats = { ...FORTRESS_RANGED_DEFINITION };
  }

  return inst;
}

export function createUnit(unitConfig, sourceBuilding) {
  const branch = unitConfig.branch;
  const branchDef = UNIT_BRANCHES[branch] || {};

  // Spawn near the source building
  const sx = sourceBuilding.px + sourceBuilding.w / 2 + (Math.random() - 0.5) * 20;
  const sy = sourceBuilding.py + sourceBuilding.h + 10;

  return {
    id:          state.nextId(),
    branch,
    name:        branchDef.label || 'Soldier',
    color:       branchDef.color || '#42A5F5',
    size:        10,

    x: sx, y: sy,
    maxHp:       unitConfig.hp,
    hp:          unitConfig.hp,
    damage:      unitConfig.damage,
    meleeArmor:  unitConfig.meleeArmor,
    pierceArmor: unitConfig.pierceArmor,
    shieldBlockMelee: unitConfig.shieldBlockMelee,
    shieldBlockPierce: unitConfig.shieldBlockPierce,
    armor:       Math.floor((unitConfig.meleeArmor + unitConfig.pierceArmor) / 2),
    range:       unitConfig.range * 32,   // convert tile-range → pixels
    speed:       unitConfig.speed,
    attackSpeed: unitConfig.attackSpeed,
    attackType:  unitConfig.attackType,
    attackCooldown: 0,
    weaponId:    unitConfig.weaponId || null,
    shieldId:    unitConfig.shieldId || null,
    armorId:     unitConfig.armorId || null,

    // AI state
    state:       'idle',   // 'idle' | 'moving' | 'attacking' | 'dead'
    target:      null,
    targetX:     null,
    targetY:     null,
    patrolCenterX: sx,
    patrolCenterY: sy,
    patrolRadius:  80,
  };
}

export function createEnemy(enemyId, spawnX, spawnY) {
  const def = ENEMY_DEFINITIONS[enemyId];
  if (!def) return null;

  return {
    id:      state.nextId(),
    defId:   enemyId,
    name:    def.name,
    color:   def.color,
    size:    def.size,

    x: spawnX, y: spawnY,
    maxHp:       def.hp,
    hp:          def.hp,
    damage:      def.damage,
    meleeArmor:  def.armor,
    pierceArmor: def.armor,
    armor:       def.armor,
    speed:       def.speed,
    attackSpeed: def.attackSpeed,
    attackCooldown: 0,
    attackRange: def.attackRange || 1,
    attackType:  def.attackType || 'melee',
    reward:      { ...def.reward },
    inSpawnZone: false,

    // Pathfinding
    pathIndex:   0,
    path:        [],
    state:       'moving',  // 'moving' | 'attacking' | 'dead'
    target:      null,
    targetX:     null,
    targetY:     null,
  };
}

export function createProjectile(srcX, srcY, target, damage, speed, color, damageType = 'pierce') {
  return {
    id:      state.nextId(),
    x: srcX, y: srcY,
    target,              // entity reference
    damage,
    damageType,
    speed,
    color,
    done: false,
  };
}
