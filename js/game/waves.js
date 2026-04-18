// Wave spawning controller

import { WAVE_DEFINITIONS, ENEMY_DEFINITIONS } from '../data/enemies.js';
import { createEnemy } from '../systems/factory.js';
import state from '../systems/gameState.js';

function getSpawnPoint(map) {
  return map.getRandomSpawnPoint();
}

// Generate a scaled-up wave definition after the defined waves run out
function generateProcWave(waveNum) {
  const scale = 1 + (waveNum - WAVE_DEFINITIONS.length) * 0.3;
  return [
    { enemy: 'goblin',     count: Math.floor(20 * scale), interval: 0.5, startTime: 2 },
    { enemy: 'orc',        count: Math.floor(15 * scale), interval: 1.0, startTime: 5 },
    { enemy: 'wolf_rider', count: Math.floor(10 * scale), interval: 1.5, startTime: 8 },
    { enemy: 'troll',      count: Math.floor(4  * scale), interval: 6,   startTime: 12 },
    { enemy: 'dark_knight',count: Math.floor(2  * scale), interval: 15,  startTime: 25 },
  ];
}

export class WaveController {
  constructor(map, onWaveEnd, onAllWavesComplete) {
    this.map             = map;
    this.onWaveEnd       = onWaveEnd;
    this.onAllWavesComplete = onAllWavesComplete;

    this.active          = false;
    this.waveTimer       = 0;
    this._groups         = [];   // pending spawn groups this wave
    this._spawnTimers    = [];   // per-group timer state
  }

  startWave(waveIndex) {
    const def = waveIndex < WAVE_DEFINITIONS.length
      ? WAVE_DEFINITIONS[waveIndex]
      : generateProcWave(waveIndex + 1);

    this.active      = true;
    this.waveTimer   = 0;
    this._groups     = def.map(g => ({ ...g }));
    this._spawnTimers = this._groups.map(g => ({
      started:       false,
      elapsed:       0,
      spawned:       0,
      intervalTimer: 0,
    }));
  }

  update(dt) {
    if (!this.active) return;

    this.waveTimer += dt;

    let allGroupsDone = true;

    for (let i = 0; i < this._groups.length; i++) {
      const grp   = this._groups[i];
      const timer = this._spawnTimers[i];

      if (timer.spawned >= grp.count) continue;  // group finished
      allGroupsDone = false;

      // Wait for startTime
      if (this.waveTimer < grp.startTime) continue;

      timer.started = true;
      timer.elapsed += dt;

      if (timer.spawned === 0 || timer.intervalTimer <= 0) {
        // Spawn one enemy
        const sp = getSpawnPoint(this.map);
        const enemy = createEnemy(grp.enemy, sp.x, sp.y);
        if (enemy) {
          // Assign a path toward the fortress immediately
          const fortress = state.buildings.find(b => b.isHq);
          if (fortress) {
            this._assignPath(enemy, fortress);
          }
          state.enemies.push(enemy);
        }
        timer.spawned++;
        timer.intervalTimer = grp.interval;
      } else {
        timer.intervalTimer -= dt;
      }
    }

    // Wave ends when all enemies are dead AND all groups are done
    const allSpawned = this._groups.every((g, i) => this._spawnTimers[i].spawned >= g.count);
    if (allSpawned && state.enemies.length === 0) {
      this.active = false;
      // Notify
      const isLast = state.currentWave >= state.totalWaves;
      if (isLast) {
        this.onAllWavesComplete();
      } else {
        this.onWaveEnd();
      }
    }
  }

  _assignPath(enemy, fortress) {
    // Import lazily to avoid circular dep issues
    // We'll trigger path assignment from combat.js via a shared helper instead
    // For now, set a simple direct target; pathfinding called from main loop
    enemy.goalX = fortress.px + fortress.w / 2;
    enemy.goalY = fortress.py + fortress.h / 2;
    enemy.goalTile = {
      tx: fortress.tileX + Math.floor(fortress.size / 2),
      ty: fortress.tileY + Math.floor(fortress.size / 2),
    };
  }
}
