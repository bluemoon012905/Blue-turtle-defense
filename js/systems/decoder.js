// Decoder — reads data definitions + game state and produces runtime configs

import { BASE_SOLDIER, EQUIPMENT_DEFINITIONS } from '../data/soldiers.js';
import state from './gameState.js';

/**
 * Given a unit branch and an array of equipment ids,
 * return the fully computed unit config (stats, cost, trainTime).
 */
export function decodeUnit(branch, equipmentIds = []) {
  const base = { ...BASE_SOLDIER };

  // Start from base
  let stats = {
    hp:          base.hp,
    damage:      base.damage,
    meleeArmor:  base.meleeArmor,
    pierceArmor: base.pierceArmor,
    shieldBlockMelee: base.shieldBlockMelee,
    shieldBlockPierce: base.shieldBlockPierce,
    range:       base.range,
    speed:       base.speed,
    attackSpeed: base.attackSpeed,
    attackType:  base.attackType,
    pop:         base.pop,
    trainTime:   base.trainTime,
    cost:        { ...base.cost },
  };

  // Apply equipment mods
  for (const eqId of equipmentIds) {
    const eq = EQUIPMENT_DEFINITIONS[eqId];
    if (!eq) continue;
    for (const [stat, val] of Object.entries(eq.statMods)) {
      if (stat === 'cost') continue;
      if (stats[stat] !== undefined) stats[stat] += val;
    }
    if (eq.attackType) stats.attackType = eq.attackType;
    for (const [res, val] of Object.entries(eq.costMods)) {
      stats.cost[res] = (stats.cost[res] || 0) + val;
    }
    for (const [key, val] of Object.entries(eq.timeMods)) {
      stats[key] = (stats[key] || 0) + val;
    }
    stats.pop += eq.popMod || 0;
  }

  // Apply global branch tech bonuses
  const bonuses = state.branchBonuses[branch] || {};
  for (const [stat, val] of Object.entries(bonuses)) {
    if (stats[stat] !== undefined) stats[stat] += val;
  }

  if (stats.attackType === 'pierce') {
    stats.damage += bonuses.pierceDamage || 0;
  }

  // Clamp
  stats.hp          = Math.max(1,   stats.hp);
  stats.damage      = Math.max(1,   stats.damage);
  stats.meleeArmor  = Math.max(0,   stats.meleeArmor);
  stats.pierceArmor = Math.max(0,   stats.pierceArmor);
  stats.shieldBlockMelee = Math.max(0, stats.shieldBlockMelee);
  stats.shieldBlockPierce = Math.max(0, stats.shieldBlockPierce);
  stats.speed       = Math.max(20,  stats.speed);
  stats.attackSpeed = Math.max(0.1, stats.attackSpeed);
  stats.pop         = Math.max(1,   stats.pop);
  stats.trainTime   = Math.max(1,   stats.trainTime);
  stats.range       = Math.max(1,   stats.range);

  return { branch, equipmentIds, ...stats };
}

/**
 * Return the cost of a building definition with current state in mind.
 * (Currently straight passthrough; hook for future cost-reduction tech.)
 */
export function decodeBuildingCost(buildingDef) {
  return { ...buildingDef.cost };
}

/**
 * Decode the runtime stats of a placed tower instance.
 * Merges base tower stats with per-tower upgrade choices.
 */
export function decodeTower(towerInstance, TOWER_DEFINITION, TECH_TREE) {
  const base = { ...(towerInstance.towerStats || TOWER_DEFINITION) };
  const upgrades = towerInstance.chosenUpgrades || [];

  let attackSpeed     = base.attackSpeed;
  let damage          = base.damage;
  let projectileCount = base.projectileCount;

  for (const upId of upgrades) {
    const tech = TECH_TREE[upId];
    if (!tech) continue;
    for (const eff of tech.effects) {
      if (eff.type !== 'tower_upgrade') continue;
      if (eff.stat === 'attackSpeed')     attackSpeed     += eff.value;
      if (eff.stat === 'damage')          damage          += eff.value;
      if (eff.stat === 'projectileCount') projectileCount += eff.value;
    }
  }

  return {
    attackSpeed:     Math.max(0.1, attackSpeed),
    damage:          Math.max(1,   damage),
    projectileCount: Math.max(1,   projectileCount),
    range:           base.range,
    projectileSpeed: base.projectileSpeed,
    projectileColor: base.projectileColor || '#FFD700',
  };
}
