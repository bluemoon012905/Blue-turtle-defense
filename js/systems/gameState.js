// Singleton game state — the single source of truth for all mutable game data

const state = {
  // Resources
  resources: { gold: 200 },
  popCap: 20,

  // Wave tracking
  currentWave: 0,
  wavePhase: 'prep',    // 'prep' | 'active' | 'victory' | 'defeat'
  totalWaves: 10,

  // Entities (arrays managed by factory / game loop)
  buildings: [],        // { ...BuildingInstance }
  units: [],            // { ...UnitInstance }
  enemies: [],          // { ...EnemyInstance }
  projectiles: [],      // { ...ProjectileInstance }

  // Global unlocks (reserved for build/tech systems)
  globalUnlocks: new Set(),

  // Researched tech node ids
  researchedTech: new Set(),

  // Unlocked equipment ids
  unlockedEquipment: new Set(['club']),

  // Per-branch cumulative tech bonuses
  branchBonuses: {
    infantry: {
      damage: 0,
      hp: 0,
      meleeArmor: 0,
      pierceArmor: 0,
      speed: 0,
      attackSpeed: 0,
      range: 0,
      pierceDamage: 0,
    },
  },

  // Active research queue  { nodeId, progress (0–1), timeRemaining }
  researchQueue: [],

  // Map reference (set by map.js on init)
  map: null,

  // Selected tile / building / entity for info bar
  selected: null,     // { type: 'building'|'tile'|'unit', ref: ... }

  // Currently selected build item id (from build panel)
  buildSelection: null,

  // Wave-end unlock choice
  waveRewardDraft: null,

  // ID counters
  _nextId: 1,
  nextId() { return this._nextId++; },

  // Pause
  paused: false,
};

export default state;
