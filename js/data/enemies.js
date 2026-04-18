// Enemy definitions and wave data

export const ENEMY_DEFINITIONS = {
  goblin: {
    id: 'goblin', name: 'Goblin',
    hp: 40, damage: 4, armor: 0,
    speed: 70, attackSpeed: 1.0,
    reward: { gold: 8 },
    color: '#4CAF50', size: 9,
    attackRange: 1,  // pixels (melee)
  },
  orc: {
    id: 'orc', name: 'Orc',
    hp: 130, damage: 12, armor: 2,
    speed: 45, attackSpeed: 0.8,
    reward: { gold: 20 },
    color: '#E64A19', size: 14,
    attackRange: 1,
  },
  wolf_rider: {
    id: 'wolf_rider', name: 'Wolf Rider',
    hp: 65, damage: 9, armor: 1,
    speed: 115, attackSpeed: 1.2,
    reward: { gold: 15 },
    color: '#FF9800', size: 12,
    attackRange: 1,
  },
  troll: {
    id: 'troll', name: 'Troll',
    hp: 320, damage: 28, armor: 5,
    speed: 30, attackSpeed: 0.5,
    reward: { gold: 50 },
    color: '#7B1FA2', size: 20,
    attackRange: 1,
  },
  dark_knight: {
    id: 'dark_knight', name: 'Dark Knight',
    hp: 550, damage: 45, armor: 10,
    speed: 40, attackSpeed: 0.7,
    reward: { gold: 100 },
    color: '#212121', size: 18,
    attackRange: 1,
  },
};

// Each wave: array of spawn groups { enemy, count, interval (s), startTime (s) }
// After all defined waves, additional waves are generated procedurally in waves.js
export const WAVE_DEFINITIONS = [
  // Wave 1 – tutorial
  [{ enemy: 'goblin', count: 5,  interval: 1.5, startTime: 3 }],
  // Wave 2
  [{ enemy: 'goblin', count: 8,  interval: 1.2, startTime: 2 },
   { enemy: 'orc',    count: 2,  interval: 6,   startTime: 14 }],
  // Wave 3
  [{ enemy: 'goblin',    count: 10, interval: 1.0, startTime: 2 },
   { enemy: 'orc',       count: 4,  interval: 4,   startTime: 10 }],
  // Wave 4
  [{ enemy: 'goblin',    count: 8,  interval: 1.0, startTime: 2 },
   { enemy: 'orc',       count: 6,  interval: 3,   startTime: 8 },
   { enemy: 'wolf_rider',count: 3,  interval: 4,   startTime: 18 }],
  // Wave 5
  [{ enemy: 'orc',       count: 10, interval: 2,   startTime: 3 },
   { enemy: 'wolf_rider',count: 5,  interval: 3,   startTime: 5 },
   { enemy: 'troll',     count: 1,  interval: 20,  startTime: 30 }],
  // Wave 6
  [{ enemy: 'goblin',    count: 15, interval: 0.8, startTime: 2 },
   { enemy: 'orc',       count: 8,  interval: 2,   startTime: 10 },
   { enemy: 'wolf_rider',count: 6,  interval: 2,   startTime: 12 }],
  // Wave 7
  [{ enemy: 'orc',       count: 12, interval: 1.5, startTime: 3 },
   { enemy: 'troll',     count: 3,  interval: 15,  startTime: 10 },
   { enemy: 'wolf_rider',count: 8,  interval: 2,   startTime: 5 }],
  // Wave 8
  [{ enemy: 'goblin',    count: 20, interval: 0.6, startTime: 2 },
   { enemy: 'orc',       count: 15, interval: 1.5, startTime: 5 },
   { enemy: 'troll',     count: 5,  interval: 10,  startTime: 15 }],
  // Wave 9
  [{ enemy: 'orc',       count: 20, interval: 1.0, startTime: 2 },
   { enemy: 'wolf_rider',count: 12, interval: 1.5, startTime: 5 },
   { enemy: 'troll',     count: 5,  interval: 8,   startTime: 10 },
   { enemy: 'dark_knight', count: 1, interval: 30, startTime: 50 }],
  // Wave 10 – finale
  [{ enemy: 'goblin',     count: 25, interval: 0.5, startTime: 2 },
   { enemy: 'orc',        count: 20, interval: 1.0, startTime: 5 },
   { enemy: 'wolf_rider', count: 15, interval: 1.0, startTime: 8 },
   { enemy: 'troll',      count: 8,  interval: 8,   startTime: 15 },
   { enemy: 'dark_knight',count: 3,  interval: 20,  startTime: 40 }],
];
