// TechNodeDefinition — all researchable technologies

export const TECH_TREE = {
  infantry_tier1: {
    id: 'infantry_tier1', name: 'Drill Yard', category: 'infantry',
    cost: { gold: 80 }, researchTime: 15,
    prerequisites: [],
    effects: [
      { type: 'branch_stat', branch: 'infantry', stat: 'damage', value: 2 },
      { type: 'branch_stat', branch: 'infantry', stat: 'hp', value: 10 },
    ],
    unlocks: [],
    description: '+2 damage, +10 HP for all barracks infantry.',
  },
  infantry_tier2: {
    id: 'infantry_tier2', name: 'Hardened Veterans', category: 'infantry',
    cost: { gold: 150 }, researchTime: 25,
    prerequisites: ['infantry_tier1'],
    effects: [
      { type: 'branch_stat', branch: 'infantry', stat: 'damage', value: 3 },
      { type: 'branch_stat', branch: 'infantry', stat: 'speed', value: 6 },
    ],
    unlocks: [],
    description: '+3 damage, +6 speed for all barracks infantry.',
  },
  infantry_tier3: {
    id: 'infantry_tier3', name: 'Campaign Veterans', category: 'infantry',
    cost: { gold: 250 }, researchTime: 40,
    prerequisites: ['infantry_tier2'],
    effects: [
      { type: 'branch_stat', branch: 'infantry', stat: 'hp', value: 20 },
      { type: 'branch_stat', branch: 'infantry', stat: 'attackSpeed', value: 0.15 },
    ],
    unlocks: [],
    description: '+20 HP, +0.15 attack speed for all barracks infantry.',
  },

  ranged_tier1: {
    id: 'ranged_tier1', name: 'Missile Drill', category: 'ranged',
    cost: { gold: 110 }, researchTime: 18,
    prerequisites: [],
    effects: [
      { type: 'branch_stat', branch: 'infantry', stat: 'range', value: 1 },
    ],
    unlocks: [],
    description: '+1 range for all barracks infantry.',
  },
  ranged_tier2: {
    id: 'ranged_tier2', name: 'Fletching', category: 'ranged',
    cost: { gold: 180 }, researchTime: 28,
    prerequisites: ['ranged_tier1'],
    effects: [
      { type: 'branch_stat', branch: 'infantry', stat: 'pierceDamage', value: 2 },
    ],
    unlocks: [],
    description: '+2 ranged damage for all barracks infantry.',
  },
  ranged_tier3: {
    id: 'ranged_tier3', name: 'Siege Strings', category: 'ranged',
    cost: { gold: 260 }, researchTime: 38,
    prerequisites: ['ranged_tier2'],
    effects: [
      { type: 'branch_stat', branch: 'infantry', stat: 'range', value: 1 },
      { type: 'branch_stat', branch: 'infantry', stat: 'attackSpeed', value: 0.1 },
    ],
    unlocks: [],
    description: '+1 range, +0.1 attack speed for all barracks infantry.',
  },

  defense_tier1: {
    id: 'defense_tier1', name: 'Leather Layering', category: 'defense',
    cost: { gold: 100 }, researchTime: 16,
    prerequisites: [],
    effects: [
      { type: 'branch_stat', branch: 'infantry', stat: 'meleeArmor', value: 1 },
      { type: 'branch_stat', branch: 'infantry', stat: 'pierceArmor', value: 1 },
    ],
    unlocks: [],
    description: '+1/+1 armor for all barracks infantry.',
  },
  defense_tier2: {
    id: 'defense_tier2', name: 'Shield Wall Doctrine', category: 'defense',
    cost: { gold: 170 }, researchTime: 26,
    prerequisites: ['defense_tier1'],
    effects: [
      { type: 'branch_stat', branch: 'infantry', stat: 'meleeArmor', value: 2 },
    ],
    unlocks: [],
    description: '+2 melee armor for all barracks infantry.',
  },
  defense_tier3: {
    id: 'defense_tier3', name: 'Bolt Screens', category: 'defense',
    cost: { gold: 240 }, researchTime: 34,
    prerequisites: ['defense_tier2'],
    effects: [
      { type: 'branch_stat', branch: 'infantry', stat: 'pierceArmor', value: 2 },
      { type: 'branch_stat', branch: 'infantry', stat: 'hp', value: 15 },
    ],
    unlocks: [],
    description: '+2 ranged armor, +15 HP for all barracks infantry.',
  },

  tower_speed: {
    id: 'tower_speed', name: 'Rapid Fire', category: 'tower',
    cost: { gold: 100 }, researchTime: 18,
    prerequisites: [],
    effects: [{ type: 'tower_upgrade', stat: 'attackSpeed', value: 0.5 }],
    unlocks: [],
    isPerTower: true,
    description: '+0.5 attacks/sec for the selected tower.',
  },
  tower_damage: {
    id: 'tower_damage', name: 'Piercing Arrows', category: 'tower',
    cost: { gold: 120 }, researchTime: 18,
    prerequisites: [],
    effects: [{ type: 'tower_upgrade', stat: 'damage', value: 15 }],
    unlocks: [],
    isPerTower: true,
    description: '+15 damage per shot for the selected tower.',
  },
  tower_count: {
    id: 'tower_count', name: 'Volley Fire', category: 'tower',
    cost: { gold: 130 }, researchTime: 22,
    prerequisites: [],
    effects: [{ type: 'tower_upgrade', stat: 'projectileCount', value: 2 }],
    unlocks: [],
    isPerTower: true,
    description: '+2 projectiles per volley for the selected tower.',
  },
};

export const TECH_CATEGORIES = [
  { id: 'infantry', label: 'Infantry', nodes: ['infantry_tier1', 'infantry_tier2', 'infantry_tier3'] },
  { id: 'ranged', label: 'Ranged', nodes: ['ranged_tier1', 'ranged_tier2', 'ranged_tier3'] },
  { id: 'defense', label: 'Defense', nodes: ['defense_tier1', 'defense_tier2', 'defense_tier3'] },
  { id: 'tower', label: 'Tower', nodes: ['tower_speed', 'tower_damage', 'tower_count'] },
];
