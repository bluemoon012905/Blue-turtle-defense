# Blue Turtle Defense

A statically hosted PvE real-time strategy tower-defense game. Build a base, train armies, research technology, and defend your Fortress against 10 escalating enemy waves.

No build step. No dependencies. Open `index.html` in a browser.

---

## Quick Start

```bash
# Clone and open — that's it
git clone <repo>
cd Blue-turtle-defense
open index.html   # or serve with any static file server
```

For GitHub Pages: push to `main` and enable Pages from the repo settings. The `.nojekyll` file is already present.

Local dev with a file server (avoids ES module CORS issues in some browsers):
```bash
npx serve .
# or
python3 -m http.server 8080
```

---

## Project Structure

```
Blue-turtle-defense/
├── index.html              # Game shell, all screens, UI markup
├── css/
│   └── style.css           # All styles (dark theme, layout, UI components)
└── js/
    ├── main.js             # Entry point — game loop, event wiring, screen transitions
    ├── data/               # Static content definitions (edit to balance/add content)
    │   ├── buildings.js    # BuildingDefinition — all structures
    │   ├── soldiers.js     # BASE_SOLDIER + EquipmentDefinition
    │   ├── tech.js         # TechNodeDefinition + category display order
    │   ├── towers.js       # TowerDefinition — shared ranged-defense base stats
    │   └── enemies.js      # EnemyDefinition + WAVE_DEFINITIONS (10 waves)
    ├── systems/            # Core runtime systems
    │   ├── gameState.js    # Singleton state — single source of truth
    │   ├── decoder.js      # Reads defs + state → computes runtime configs
    │   └── factory.js      # Creates entity instances from decoded configs
    ├── game/               # Game logic
    │   ├── map.js          # GameMap class — tile grid, placement, walkability
    │   ├── pathfinding.js  # A* — finds pixel-waypoint paths on the tile grid
    │   ├── combat.js       # All per-tick AI: enemies, units, towers, projectiles, queues
    │   ├── waves.js        # WaveController — spawning and wave lifecycle
    │   └── renderer.js     # Canvas renderer — draws everything each frame
    └── ui/
        └── panels.js       # HUD, build panel, units tab, tech tab, info bar, fortress overlay
```

### Dependency flow (no circular imports)

```
data/*  ──→  systems/gameState
        ──→  systems/decoder   (reads data + gameState)
        ──→  systems/factory   (reads data + gameState)
        ──→  game/*            (reads data + systems)
        ──→  ui/panels         (reads data + systems)
        ──→  main.js           (imports everything)
```

---

## Architecture: Factory + Decoder

Content is defined as plain data objects. The **Decoder** reads those objects plus current game state to produce a runtime config. The **Factory** turns that config into a live entity.

```
Data definition  →  Decoder  →  Runtime config  →  Factory  →  Entity instance
```

**Example — training a soldier:**
1. Player selects a barracks loadout: weapon, optional shield, optional armor
2. `decodeUnit(branch, equipmentIds)` sums base stats + loadout stats + tech bonuses → config
3. Config is pushed onto a building's `productionQueue`
4. When the timer fires, an inline unit spawn in `combat.js` creates the live unit object

**Example — ranged-defense shooting:**
1. A tower or fortress instance has a `chosenUpgrades` array of tech node ids
2. `decodeTower(towerInstance, TOWER_DEFINITION, TECH_TREE)` reads the instance stats cache and adds upgrade bonuses → runtime stats
3. `updateTowers(dt)` in `combat.js` uses those stats each tick for any building with `towerStats`

---

## Game State

`js/systems/gameState.js` is a singleton object. Everything mutable lives here.

| Field | Type | Description |
|---|---|---|
| `resources` | `{gold}` | Current currency amount |
| `popCap` | number | Max population (base 20, +10 per House) |
| `currentWave` | number | Wave number (1-indexed) |
| `wavePhase` | string | `'prep'` \| `'active'` \| `'victory'` \| `'defeat'` |
| `buildings` | array | All placed building instances |
| `units` | array | All live friendly unit instances |
| `enemies` | array | All live enemy instances |
| `projectiles` | array | In-flight projectile instances |
| `globalUnlocks` | Set\<string\> | Reserved for global build or tech flags |
| `researchedTech` | Set\<string\> | Completed tech node ids |
| `unlockedEquipment` | Set\<string\> | Equipment ids currently available in barracks loadouts |
| `branchBonuses` | object | Cumulative infantry stat bonuses from tech |
| `researchQueue` | array | `[{nodeId, timeRemaining}]` — sequential queue |
| `map` | GameMap | Set on `initGame()` |
| `selected` | object | `{type:'building'|'tile', ref?}` |
| `buildSelection` | string\|null | Currently selected building def id |
| `waveRewardDraft` | object\|null | Current post-wave prompt `{ choices: [equipmentIds...] }` |
| `paused` | bool | Pauses all `tick()` logic |

Notes:
- The fortress is a non-placeable HQ building with ranged attacks, per-instance tower upgrades, and a repair action.
- `selected` drives both the bottom info bar and the fortress detail overlay when the HQ is clicked.

---

## Data Reference

### Adding a building (`js/data/buildings.js`)

```js
my_building: {
  id: 'my_building',
  name: 'Display Name',
  cost: { gold: 100, wood: 50 },   // omit a key to mean 0
  maxHp: 150,
  size: 2,                          // occupies size×size tiles
  color: '#rrggbb',                 // canvas fill color
  placeable: true,                  // shows in build panel
  requiresUnlock: 'some_flag',      // optional — gates behind globalUnlock
  upgrades: [],                     // optional per-building upgrade tech ids
  rangedDefense: false,             // optional metadata for shared ranged-defense buildings
  repairCostPerHp: 0.25,            // optional, used by repair-capable buildings
  generates: { gold: 1.0 },         // resources/second
  popCapBonus: 0,                   // added to state.popCap when placed
  producesUnits: false,
  trainableUnits: [],               // usually ['infantry'] for barracks
  description: 'Shown in build panel',
},
```

Then add its id to `BUILD_ORDER` to show it in the panel.

### Adding equipment (`js/data/soldiers.js`)

```js
my_weapon: {
  id: 'my_weapon', name: 'My Weapon',
  type: 'weapon',           // 'weapon' | 'shield' | 'armor'
  branch: 'infantry',
  hands: 1,                 // weapons only: 1 or 2
  weaponClass: 'melee',     // weapons only: 'melee' | 'ranged'
  attackType: 'melee',      // weapons only: 'melee' | 'pierce'
  statMods: { damage: 8, speed: -5 },  // keys match BASE_SOLDIER fields
  costMods: { gold: 20 },              // added to unit cost
  timeMods: { trainTime: 1 },          // added to train time
  description: 'Shown in units tab',
},
```

Notes:
- One-handed melee weapons may be paired with a shield.
- Two-handed melee and all ranged weapons cannot use shields.
- Armor uses split values: `meleeArmor/pierceArmor`. Example: medium anti-range armor is `0/4`.
- Wave rewards add new equipment ids to `state.unlockedEquipment`.

### Adding a tech node (`js/data/tech.js`)

```js
my_tech: {
  id: 'my_tech', name: 'My Tech', category: 'infantry',
  cost: { gold: 150 }, researchTime: 25,
  prerequisites: ['infantry_tier1'],  // must be researched first
  effects: [
    { type: 'branch_stat', branch: 'infantry', stat: 'damage', value: 5 },
  ],
  unlocks: ['my_weapon'],   // optional equipment ids to unlock on completion
  description: 'Shown in tech panel',
},
```

Effect types: `'branch_stat'` (adds to `state.branchBonuses`), `'tower_upgrade'` (per-tower, handled by decoder).

Add the node id to the relevant array in `TECH_CATEGORIES` to display it.

### Adding an enemy (`js/data/enemies.js`)

```js
skeleton: {
  id: 'skeleton', name: 'Skeleton',
  hp: 80, damage: 8, armor: 1,
  speed: 55, attackSpeed: 1.0,
  reward: { gold: 12 },
  color: '#ECEFF1', size: 11,
  attackRange: 1,
  attackType: 'melee',      // optional, defaults to melee
},
```

Then reference it by id in `WAVE_DEFINITIONS`.

### Editing waves (`js/data/enemies.js`)

Each wave is an array of spawn groups:
```js
[
  { enemy: 'goblin',  count: 10, interval: 1.0, startTime: 2  },
  //                                             ^ seconds into wave before first spawn
  //                              ^ seconds between spawns
  { enemy: 'troll',   count: 2,  interval: 15,  startTime: 30 },
]
```

After the 10 defined waves, `waves.js` auto-generates procedurally scaled waves.

---

## Key Systems

### Map & placement (`js/game/map.js`)

- `map.canPlace(tx, ty, size)` — returns true if all tiles in the footprint are empty
- `map.markOccupied(tx, ty, size)` — marks tiles and sets `walkable[ty][tx] = false`
- `map.markEmpty(tx, ty, size)` — reverses the above (used on sell)
- After any placement/removal, call `rePathAllEnemies()` from `combat.js`

### Pathfinding (`js/game/pathfinding.js`)

A* on the tile grid with octile distance heuristic and 8-directional movement. Returns an array of pixel-centre waypoints `[{x, y}, ...]`. Enemies step through `path[pathIndex]` each tick; the path is refreshed when exhausted or on repath.

### Combat tick (`js/game/combat.js`)

All called from `main.js → tick(dt)`:

| Function | What it does |
|---|---|
| `updateEnemies(dt)` | Move enemies along path, attack units/fortress with typed damage |
| `updateUnits(dt)` | Patrol near spawn, chase+attack nearby enemies with melee or pierce attacks |
| `updateTowers(dt)` | Find targets in range, fire projectiles for any ranged-defense building |
| `updateProjectiles(dt)` | Move projectiles toward target, apply damage on arrival |
| `updateResourceBuildings(dt)` | Tick gold generation for mines |
| `updateProductionQueues(dt)` | Advance training timers, spawn finished units |
| `updateResearch(dt)` | Advance active research, apply tech effects on completion |
| `pruneDeadEntities()` | Remove `state === 'dead'` entities from arrays |
| `rePathAllEnemies()` | Clear all enemy paths (called after map changes) |

### Renderer (`js/game/renderer.js`)

Pure canvas drawing, called once per frame after `tick()`. Nothing in the renderer mutates game state. Call `renderer.setGhost(tx, ty, defId)` to show a placement preview; `setGhost(null, null, null)` to clear it.

### Selection UI (`js/ui/panels.js` + `js/main.js`)

- Clicking most buildings updates the bottom info bar and available action buttons.
- Clicking the fortress also opens a centered overlay panel with HP, ranged stats, remaining upgrades, and a repair button.
- Fortress upgrades reuse the same per-instance `tower_upgrade` tech nodes that arrow towers use.

---

## Adding a New Feature — Examples

### New resource building

1. Add to `BUILDING_DEFINITIONS` with `generates: { gold: X }` and `placeable: true`
2. Add id to `BUILD_ORDER`
3. Done — `updateResourceBuildings` handles any key in `generates` automatically

### New barracks unlock

1. Add an equipment entry to `EQUIPMENT_DEFINITIONS`
2. Add its id to `UNLOCK_DRAFT_POOL` if it should appear as a post-wave reward
3. Add or adjust supporting tech bonuses in `TECH_TREE` if needed
4. The units panel will expose it automatically once `state.unlockedEquipment` contains the id

### New tower type

1. Add a new building definition with `defId: 'tower2'`
2. Give it ranged stats in `factory.js` by setting `inst.towerStats`
3. Add its own upgrade path tech nodes to `TECH_TREE`
4. In `renderer.js`, add a case for the new defId in `_drawBuildings`
5. If it needs special UI, extend `panels.js`; otherwise `updateTowers()` already handles any building with `towerStats`

### Fortress behavior

- The fortress is created in `main.js` at map center and marked occupied like any other structure.
- Its ranged profile is initialized in `factory.js` and decoded through the same `decodeTower()` path as towers.
- Clicking it sets `state.selected` and opens the fortress overlay.
- Repairing spends gold and restores the fortress to full HP.

---

## Deferred for Later Versions

Planned future work:

- Multiple tower base types
- Unique soldier classes with special abilities
- Faction system
- Advanced tower targeting modes (closest, strongest, first, last)
- Branching building specializations beyond Barracks
- Hero / commander units
- Multiplayer

---

## Original Design Document

The original design spec (game overview, architecture rationale, full data model description) is preserved below.

<details>
<summary>Click to expand original spec</summary>

### General Description

This project is a statically hosted real-time strategy survival game inspired by the control style and presentation of classic RTS titles such as Age of Empires. The game uses a similar top-down point of view and familiar RTS interactions, including resource management, building placement, and defensive planning. Instead of focusing on player-versus-player competition, the game is designed around a player-versus-environment survival experience.

The main objective is to defend a central structure against repeated enemy invasions. Players must gather resources, expand their base, train units, and construct defenses in order to survive increasingly difficult attacks.

### Architectural Direction

**Factory + Decoder Architecture:** Game content is defined through data objects rather than directly embedded in gameplay logic. A decoder reads structured data such as soldier equipment, building definitions, tower upgrades, tech tree nodes, production costs, and production times. A factory creates the actual in-game object from that data. This means a new weapon, armor piece, or wave reward can be added primarily through data definitions.

### Core Systems

**Buildings:** The fortress is the central HQ, fires arrows automatically, supports per-instance tower upgrades, and can be repaired from its detail panel. Barracks train a single infantry line with configurable loadouts. Individual barracks keep their own local production queues, selected loadout, and HP.

**Unit System:** Single base soldier template modified through equipment. Weapons define melee or ranged behavior, shields add separate block values, and armor uses split melee/pierce protection. Final stats = base + equipment mods + tech bonuses.

**Tech Trees:** Infantry, Ranged, Defense, and Tower categories. Tower-upgrade tech is applied per selected ranged-defense building rather than globally.

**Progression Model:** Research provides global combat bonuses while completed waves present a three-choice unlock draft that expands the barracks equipment pool over time.

</details>
