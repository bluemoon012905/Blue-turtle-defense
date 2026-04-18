// TowerDefinition — base stats for the single arrow tower type

export const TOWER_DEFINITION = {
  id:               'tower',
  name:             'Arrow Tower',
  damage:           10,
  attackSpeed:      0.8,    // attacks per second
  range:            5,      // in tiles
  projectileCount:  1,
  projectileSpeed:  260,    // pixels / second
  color:            '#607D8B',
  projectileColor:  '#FFD700',
  upgradePaths:     ['tower_speed', 'tower_damage', 'tower_count'],
};
