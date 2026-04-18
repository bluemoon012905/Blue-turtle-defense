// main.js — entry point, game loop, event wiring

import { GameMap }          from './game/map.js';
import { Renderer }         from './game/renderer.js';
import { WaveController }   from './game/waves.js';
import {
  updateEnemies, updateUnits, updateTowers,
  updateProjectiles, updateResourceBuildings,
  updateProductionQueues, updateResearch,
  pruneDeadEntities, rePathAllEnemies,
} from './game/combat.js';
import { createBuilding }   from './systems/factory.js';
import { BUILDING_DEFINITIONS } from './data/buildings.js';
import { TECH_TREE }        from './data/tech.js';
import { EQUIPMENT_DEFINITIONS, STARTING_EQUIPMENT, UNLOCK_DRAFT_POOL } from './data/soldiers.js';
import state                from './systems/gameState.js';
import {
  updateHUD, renderBuildPanel, refreshBuildPanel,
  renderUnitsPanel, renderTechPanel, renderInfoBar,
  renderWaveRewardOverlay, updateResearchProgress, renderFortressPanel,
} from './ui/panels.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const TILE_SIZE  = 20;
const MAP_COLS   = 144;
const MAP_ROWS   = 144;
const SPAWN_ZONE_TILES = 10;
const SIDEBAR_W  = 240;
const HUD_H      = 48;
const INFO_H     = 80;
const CAMERA_PAN_SPEED = 720;
const MINIMAP_SIZE = 180;

// ── Init game canvas size ─────────────────────────────────────────────────────

function sizeCanvas() {
  const canvas = document.getElementById('game-canvas');
  const minimapCanvas = document.getElementById('minimap-canvas');
  if (!map) return;

  const viewportWidth = Math.max(320, window.innerWidth - SIDEBAR_W);
  const viewportHeight = Math.max(240, window.innerHeight - HUD_H - INFO_H);

  canvas.width  = viewportWidth;
  canvas.height = viewportHeight;
  canvas.style.width  = canvas.width  + 'px';
  canvas.style.height = canvas.height + 'px';

  if (renderer) renderer.setViewport(viewportWidth, viewportHeight);

  if (minimapCanvas) {
    const displaySize = window.innerWidth <= 900 ? 140 : MINIMAP_SIZE;
    minimapCanvas.width = displaySize;
    minimapCanvas.height = displaySize;
  }
}

// ── Game globals ──────────────────────────────────────────────────────────────

let map, renderer, waveCtrl;
let lastTime       = 0;
let rafHandle      = null;
let selectedBuilding = null;
let uiThrottleTimer  = 0;
let uiWired          = false;
let isMiddlePanning  = false;
let panLastX         = 0;
let panLastY         = 0;
const cameraKeys     = new Set();

// ── Screens ───────────────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ── Game initialization ───────────────────────────────────────────────────────

function initGame() {
  // Reset state
  state.resources       = { gold: 200 };
  state.popCap          = 20;
  state.currentWave     = 0;
  state.wavePhase       = 'prep';
  state.buildings       = [];
  state.units           = [];
  state.enemies         = [];
  state.projectiles     = [];
  state.globalUnlocks   = new Set();
  state.researchedTech  = new Set();
  state.unlockedEquipment = new Set(STARTING_EQUIPMENT);
  state.branchBonuses   = {
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
  };
  state.researchQueue   = [];
  state.selected        = null;
  state.buildSelection  = null;
  state.waveRewardDraft = null;
  state.paused          = false;
  state._nextId         = 1;
  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) pauseBtn.textContent = 'Pause';

  // Create map
  map        = new GameMap(MAP_COLS, MAP_ROWS, TILE_SIZE, { spawnZoneTiles: SPAWN_ZONE_TILES });
  state.map  = map;

  // Place fortress at center using its defined footprint
  const fortressSize = BUILDING_DEFINITIONS.fortress.size;
  const fTx = Math.floor((MAP_COLS - fortressSize) / 2);
  const fTy = Math.floor((MAP_ROWS - fortressSize) / 2);
  const fortress = createBuilding('fortress', fTx, fTy, TILE_SIZE);
  fortress.color = '#4a90d9';
  state.buildings.push(fortress);
  map.markOccupied(fTx, fTy, fortressSize);

  // Renderer
  sizeCanvas();
  const canvas = document.getElementById('game-canvas');
  renderer = new Renderer(canvas, map);
  renderer.setViewport(canvas.width, canvas.height);
  renderer.centerOnWorld(fortress.px + fortress.w / 2, fortress.py + fortress.h / 2);

  // Wave controller
  waveCtrl = new WaveController(map, onWaveEnd, onAllWavesComplete);

  // Wire UI
  wireUI();

  // Initial UI render
  renderBuildPanel(onBuildSelect);
  renderTechPanel(onResearch);
  renderInfoBar(onAction);
  renderFortressPanel(onAction);
  renderWaveRewardOverlay(onSelectWaveReward);
  updateHUD();

  showScreen('screen-game');
  startLoop();
}

// ── Game loop ─────────────────────────────────────────────────────────────────

function startLoop() {
  lastTime = performance.now();
  rafHandle = requestAnimationFrame(loop);
}

function stopLoop() {
  if (rafHandle) cancelAnimationFrame(rafHandle);
  rafHandle = null;
}

function loop(now) {
  rafHandle = requestAnimationFrame(loop);

  const dt = Math.min((now - lastTime) / 1000, 0.1); // cap at 100ms
  lastTime = now;

  if (!state.paused) {
    tick(dt);
  }

  updateCamera(dt);

  renderer.draw();
  drawMinimap();

  // Throttle heavy UI rebuilds to ~4/sec
  uiThrottleTimer += dt;
  if (uiThrottleTimer >= 0.25) {
    uiThrottleTimer = 0;
    updateHUD();
    updateResearchProgress();
    refreshBuildPanel();
    if (state.selected?.type === 'building' && state.selected.ref?.producesUnits) {
      renderUnitsPanel(state.selected.ref);
    }
    renderFortressPanel(onAction);
  } else {
    // Always update HUD numbers at full rate (cheap text swaps)
    updateHUD();
  }
}

function tick(dt) {
  // Wave logic
  if (state.wavePhase === 'active') {
    waveCtrl.update(dt);
  }

  // Game systems
  updateResourceBuildings(dt);
  updateProductionQueues(dt);
  updateResearch(dt);
  updateEnemies(dt);
  updateUnits(dt);
  updateTowers(dt);
  updateProjectiles(dt);
  pruneDeadEntities(dt);

  // Population cap recalc
  state.popCap = 20 + state.buildings
    .filter(b => b.defId === 'house')
    .reduce((acc, b) => acc + (b.popCapBonus || 0), 0);

  // Check fortress death
  const fortress = state.buildings.find(b => b.isHq);
  if (fortress && fortress.hp <= 0 && state.wavePhase !== 'defeat') {
    endGame(false);
  }
}

function updateCamera(dt) {
  if (!renderer) return;

  let dx = 0;
  let dy = 0;
  if (cameraKeys.has('arrowleft')) dx -= 1;
  if (cameraKeys.has('arrowright')) dx += 1;
  if (cameraKeys.has('arrowup')) dy -= 1;
  if (cameraKeys.has('arrowdown')) dy += 1;

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy) || 1;
    renderer.moveCamera(
      ((dx / len) * CAMERA_PAN_SPEED * dt) / renderer.camera.zoom,
      ((dy / len) * CAMERA_PAN_SPEED * dt) / renderer.camera.zoom,
    );
  }
}

function drawMinimap() {
  if (!map || !renderer) return;

  const canvas = document.getElementById('minimap-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const pad = 8;
  const innerW = canvas.width - pad * 2;
  const innerH = canvas.height - pad * 2;
  const scale = Math.min(innerW / map.width, innerH / map.height);
  const drawW = map.width * scale;
  const drawH = map.height * scale;
  const offsetX = (canvas.width - drawW) / 2;
  const offsetY = (canvas.height - drawH) / 2;

  const toMini = (x, y) => ({
    x: offsetX + x * scale,
    y: offsetY + y * scale,
  });

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#355025');
  bg.addColorStop(1, '#243518');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#43652f';
  ctx.fillRect(offsetX, offsetY, drawW, drawH);

  if (map.spawnZoneTiles > 0) {
    const spawn = map.spawnZoneTiles * map.tileSize * scale;
    ctx.fillStyle = 'rgba(150, 28, 20, 0.22)';
    ctx.fillRect(offsetX, offsetY, drawW, spawn);
    ctx.fillRect(offsetX, offsetY + drawH - spawn, drawW, spawn);
    ctx.fillRect(offsetX, offsetY + spawn, spawn, drawH - spawn * 2);
    ctx.fillRect(offsetX + drawW - spawn, offsetY + spawn, spawn, drawH - spawn * 2);
  }

  for (const building of state.buildings) {
    const p = toMini(building.px, building.py);
    const size = building.w * scale;
    ctx.fillStyle = building.isHq ? '#4a90d9' : '#d4a843';
    ctx.fillRect(p.x, p.y, Math.max(3, size), Math.max(3, size));
  }

  ctx.fillStyle = '#e6d47e';
  for (const unit of state.units) {
    if (unit.state === 'dead') continue;
    const p = toMini(unit.x, unit.y);
    ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }

  ctx.fillStyle = '#c9432b';
  for (const enemy of state.enemies) {
    if (enemy.state === 'dead') continue;
    const p = toMini(enemy.x, enemy.y);
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }

  const viewport = getViewportWorldCorners();
  if (viewport.length === 4) {
    ctx.beginPath();
    viewport.forEach((point, index) => {
      const p = toMini(point.x, point.y);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(114, 191, 255, 0.12)';
    ctx.strokeStyle = '#8fd2ff';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  }

  ctx.strokeStyle = '#c8b080';
  ctx.lineWidth = 1;
  ctx.strokeRect(offsetX + 0.5, offsetY + 0.5, drawW - 1, drawH - 1);
}

function getViewportWorldCorners() {
  if (!map || !renderer) return [];

  const left = renderer.camera.x;
  const top = renderer.camera.y;
  const right = left + (renderer.camera.viewportWidth / renderer.camera.zoom);
  const bottom = top + (renderer.camera.viewportHeight / renderer.camera.zoom);

  return [
    map.screenToWorld(left, top),
    map.screenToWorld(right, top),
    map.screenToWorld(right, bottom),
    map.screenToWorld(left, bottom),
  ];
}

// ── Wave events ───────────────────────────────────────────────────────────────

function onWaveEnd() {
  state.wavePhase = 'prep';
  // Wave bonus
  const bonus = 40 + state.currentWave * 20;
  state.resources.gold += bonus;
  document.getElementById('btn-next-wave').disabled = false;
  openWaveRewardDraft();
}

function onAllWavesComplete() {
  endGame(true);
}

function startNextWave() {
  if (state.waveRewardDraft) return;
  state.currentWave++;
  state.wavePhase = 'active';
  waveCtrl.startWave(state.currentWave - 1);
  document.getElementById('btn-next-wave').disabled = true;
}

// ── End game ──────────────────────────────────────────────────────────────────

function endGame(victory) {
  state.wavePhase = victory ? 'victory' : 'defeat';
  stopLoop();

  const title = document.getElementById('gameover-title');
  const msg   = document.getElementById('gameover-msg');
  title.textContent = victory ? 'Victory!' : 'Defeat';
  title.className   = victory ? 'victory' : 'defeat';
  msg.textContent   = victory
    ? `You defended against all ${state.totalWaves} waves! Gold collected: ${Math.floor(state.resources.gold)}`
    : `Your fortress fell on wave ${state.currentWave}. Better luck next time!`;

  showScreen('screen-gameover');
}

// ── Build placement ───────────────────────────────────────────────────────────

function onBuildSelect(defId) {
  state.buildSelection = defId;
  if (!defId) renderer.setGhost(null, null, null);
}

function handleCanvasMouseMove(e) {
  if (!state.buildSelection) return;
  const { tx, ty } = canvasPosTile(e);
  renderer.setGhost(tx, ty, state.buildSelection);
}

function handleCanvasClick(e) {
  const { tx, ty } = canvasPosTile(e);

  if (state.buildSelection) {
    tryPlaceBuilding(state.buildSelection, tx, ty);
    return;
  }

  // Selection logic: check if a building occupies the clicked tile
  const hit = getBuildingAtTile(tx, ty);
  if (hit) {
    state.selected = { type: 'building', ref: hit };
    selectedBuilding = hit;
    // Switch to units tab if it produces units
    if (hit.producesUnits) {
      activateTab('units');
      renderUnitsPanel(hit);
    } else if (hit.isHq) {
      renderUnitsPanel(null);
    }
  } else {
    state.selected = { type: 'tile', tx, ty };
    selectedBuilding = null;
    renderUnitsPanel(null);
  }
  renderInfoBar(onAction);
  renderFortressPanel(onAction);
}

function handleCanvasRightClick(e) {
  e.preventDefault();
  state.buildSelection = null;
  renderer.setGhost(null, null, null);
  refreshBuildPanel();
}

function tryPlaceBuilding(defId, tx, ty) {
  const def = BUILDING_DEFINITIONS[defId];
  if (!def || !def.placeable) return;

  if (def.requiresUnlock && !state.globalUnlocks.has(def.requiresUnlock)) return;
  if (!canAffordCost(def.cost)) return;
  if (!map.canPlace(tx, ty, def.size)) return;

  spendCost(def.cost);
  const building = createBuilding(defId, tx, ty, TILE_SIZE);
  state.buildings.push(building);
  map.markOccupied(tx, ty, def.size);

  // Re-path enemies around new obstacle
  rePathAllEnemies();

  // Clear build selection after placing (hold shift to keep)
  state.buildSelection = null;
  renderer.setGhost(null, null, null);
  refreshBuildPanel();
  renderInfoBar(onAction);
  renderFortressPanel(onAction);
}

// ── Actions (sell, tower upgrade) ─────────────────────────────────────────────

function onAction(type, data) {
  if (type === 'sell') {
    const { building, refund } = data;
    // Remove from state
    state.buildings = state.buildings.filter(b => b.id !== building.id);
    map.markEmpty(building.tileX, building.tileY, building.size);
    state.resources.gold += refund.gold || 0;
    state.selected = null;
    rePathAllEnemies();
    renderInfoBar(onAction);
    renderFortressPanel(onAction);
  }

  if (type === 'tower_upgrade') {
    const { building, techId } = data;
    const tech = TECH_TREE[techId];
    if (!tech) return;
    if (!canAffordCost(tech.cost)) return;
    spendCost(tech.cost);
    building.chosenUpgrades.push(techId);
    renderInfoBar(onAction);
    renderFortressPanel(onAction);
  }

  if (type === 'repair_fortress') {
    const { building, cost } = data;
    if (!building?.isHq) return;
    if (building.hp >= building.maxHp) return;
    if (!canAffordCost(cost)) return;
    spendCost(cost);
    building.hp = building.maxHp;
    renderInfoBar(onAction);
    renderFortressPanel(onAction);
  }
}

// ── Research ──────────────────────────────────────────────────────────────────

function onResearch(nodeId) {
  const tech = TECH_TREE[nodeId];
  if (!tech) return;
  if (!canAffordCost(tech.cost)) return;
  if (state.researchedTech.has(nodeId)) return;
  if (state.researchQueue.some(j => j.nodeId === nodeId)) return;

  spendCost(tech.cost);
  state.researchQueue.push({
    nodeId,
    timeRemaining: tech.researchTime,
  });
  renderTechPanel(onResearch);
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function activateTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === 'tab-' + tabId);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function canvasPosTile(e) {
  const canvas = document.getElementById('game-canvas');
  const rect   = canvas.getBoundingClientRect();
  const cx     = e.clientX - rect.left;
  const cy     = e.clientY - rect.top;
  const world  = map.screenToWorld(
    renderer.camera.x + (cx / renderer.camera.zoom),
    renderer.camera.y + (cy / renderer.camera.zoom),
  );
  return map.pixelToTile(world.x, world.y);
}

function handleCanvasMouseDown(e) {
  if (e.button !== 1) return;
  isMiddlePanning = true;
  panLastX = e.clientX;
  panLastY = e.clientY;
  document.getElementById('game-canvas')?.classList.add('panning');
  e.preventDefault();
}

function handleWindowMouseMove(e) {
  if (!isMiddlePanning || !renderer) return;

  const dx = e.clientX - panLastX;
  const dy = e.clientY - panLastY;
  panLastX = e.clientX;
  panLastY = e.clientY;
  renderer.moveCamera(-dx / renderer.camera.zoom, -dy / renderer.camera.zoom);
}

function handleWindowMouseUp(e) {
  if (e.button !== 1 && !isMiddlePanning) return;
  isMiddlePanning = false;
  document.getElementById('game-canvas')?.classList.remove('panning');
}

function handleCanvasWheel(e) {
  if (!renderer) return;
  const canvas = document.getElementById('game-canvas');
  const rect   = canvas.getBoundingClientRect();
  const cx     = e.clientX - rect.left;
  const cy     = e.clientY - rect.top;
  const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  renderer.zoomAt(cx, cy, zoomFactor);
  e.preventDefault();
}

function handleMinimapClick(e) {
  if (!map || !renderer) return;

  const canvas = document.getElementById('minimap-canvas');
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const pad = 8;
  const innerW = canvas.width - pad * 2;
  const innerH = canvas.height - pad * 2;
  const scale = Math.min(innerW / map.width, innerH / map.height);
  const drawW = map.width * scale;
  const drawH = map.height * scale;
  const offsetX = (canvas.width - drawW) / 2;
  const offsetY = (canvas.height - drawH) / 2;
  const localX = (e.clientX - rect.left) * (canvas.width / rect.width);
  const localY = (e.clientY - rect.top) * (canvas.height / rect.height);
  const worldX = Math.max(0, Math.min(map.width, (localX - offsetX) / scale));
  const worldY = Math.max(0, Math.min(map.height, (localY - offsetY) / scale));

  renderer.centerOnWorld(worldX, worldY);
}

function handleKeyDown(e) {
  const key = e.key.toLowerCase();
  if (!key.startsWith('arrow')) return;
  cameraKeys.add(key);
  e.preventDefault();
}

function handleKeyUp(e) {
  const key = e.key.toLowerCase();
  if (!key.startsWith('arrow')) return;
  cameraKeys.delete(key);
  e.preventDefault();
}

async function toggleFullscreen() {
  const root = document.getElementById('app');
  if (!root) return;

  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await root.requestFullscreen();
  }
}

function updateFullscreenButton() {
  const btn = document.getElementById('btn-fullscreen');
  if (!btn) return;
  btn.textContent = document.fullscreenElement ? 'Windowed' : 'Fullscreen';
}

function getBuildingAtTile(tx, ty) {
  for (const b of state.buildings) {
    if (tx >= b.tileX && tx < b.tileX + b.size &&
        ty >= b.tileY && ty < b.tileY + b.size) {
      return b;
    }
  }
  return null;
}

function canAffordCost(cost) {
  return (state.resources.gold ?? 0) >= (cost.gold || 0);
}

function spendCost(cost) {
  state.resources.gold = (state.resources.gold || 0) - (cost.gold || 0);
}

// ── UI wiring ─────────────────────────────────────────────────────────────────

function wireUI() {
  if (uiWired) return;
  uiWired = true;

  const canvas = document.getElementById('game-canvas');
  const minimap = document.getElementById('minimap-canvas');
  canvas.addEventListener('mousemove', handleCanvasMouseMove);
  canvas.addEventListener('click',     handleCanvasClick);
  canvas.addEventListener('mousedown', handleCanvasMouseDown);
  canvas.addEventListener('contextmenu', handleCanvasRightClick);
  canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });
  minimap?.addEventListener('click', handleMinimapClick);
  window.addEventListener('mousemove', handleWindowMouseMove);
  window.addEventListener('mouseup', handleWindowMouseUp);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('resize', sizeCanvas);
  document.addEventListener('fullscreenchange', () => {
    updateFullscreenButton();
    sizeCanvas();
  });

  document.getElementById('btn-next-wave')?.addEventListener('click', startNextWave);

  document.getElementById('btn-pause')?.addEventListener('click', () => {
    state.paused = !state.paused;
    const btn = document.getElementById('btn-pause');
    if (btn) btn.textContent = state.paused ? 'Resume' : 'Pause';
  });

  document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
    toggleFullscreen().catch(() => {});
  });

  document.getElementById('btn-close-fortress')?.addEventListener('click', () => {
    state.selected = null;
    renderInfoBar(onAction);
    renderFortressPanel(onAction);
  });

  document.getElementById('fortress-overlay')?.addEventListener('click', e => {
    if (e.target.id !== 'fortress-overlay') return;
    state.selected = null;
    renderInfoBar(onAction);
    renderFortressPanel(onAction);
  });

  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.tab);
      if (btn.dataset.tab === 'units') {
  renderUnitsPanel(state.selected?.type === 'building' ? state.selected.ref : null);
      }
      if (btn.dataset.tab === 'tech') {
        renderTechPanel(onResearch);
      }
    });
  });

  updateFullscreenButton();
}

function getDraftChoices(count = 3) {
  const locked = UNLOCK_DRAFT_POOL.filter(id => !state.unlockedEquipment.has(id));
  const choices = [];
  const pool = [...locked];

  while (choices.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    choices.push(pool.splice(idx, 1)[0]);
  }

  return choices;
}

function openWaveRewardDraft() {
  const choices = getDraftChoices(3);
  state.waveRewardDraft = choices.length ? { choices } : null;
  renderWaveRewardOverlay(onSelectWaveReward);
}

function onSelectWaveReward(equipmentId) {
  if (!equipmentId || !EQUIPMENT_DEFINITIONS[equipmentId]) return;
  state.unlockedEquipment.add(equipmentId);
  state.waveRewardDraft = null;
  renderWaveRewardOverlay(onSelectWaveReward);

  if (state.selected?.type === 'building' && state.selected.ref?.producesUnits) {
    renderUnitsPanel(state.selected.ref);
  }
  refreshBuildPanel();
  updateHUD();
}

// ── Menu wiring ───────────────────────────────────────────────────────────────

document.getElementById('btn-start')?.addEventListener('click', initGame);

document.getElementById('btn-how-to-play')?.addEventListener('click', () => {
  showScreen('screen-howto');
});

document.getElementById('btn-back-menu')?.addEventListener('click', () => {
  showScreen('screen-menu');
});

document.getElementById('btn-restart')?.addEventListener('click', initGame);

document.getElementById('btn-menu')?.addEventListener('click', () => {
  stopLoop();
  showScreen('screen-menu');
});
