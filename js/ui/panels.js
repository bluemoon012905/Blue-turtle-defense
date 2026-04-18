// UI panels — build menu, units tab, tech tab, info bar, HUD

import { BUILDING_DEFINITIONS, BUILD_ORDER } from '../data/buildings.js';
import { EQUIPMENT_DEFINITIONS, UNIT_BRANCHES } from '../data/soldiers.js';
import { TECH_TREE, TECH_CATEGORIES } from '../data/tech.js';
import { TOWER_DEFINITION } from '../data/towers.js';
import { decodeUnit, decodeTower } from '../systems/decoder.js';
import state from '../systems/gameState.js';

// ── HUD ───────────────────────────────────────────────────────────────────────

export function updateHUD() {
  const r = state.resources;
  setText('val-gold',       Math.floor(r.gold));
  setText('val-pop',        getPopulationUsed());
  setText('val-pop-cap',    state.popCap);
  setText('val-wave',       state.currentWave);
  setText('val-fortress-hp', Math.max(0, Math.floor(getFortressHp())));

  const waveStatusEl = document.getElementById('wave-status');
  if (waveStatusEl) {
    if (state.wavePhase === 'prep')    waveStatusEl.textContent = 'Preparing…';
    else if (state.wavePhase === 'active') waveStatusEl.textContent = '⚔ Attack!';
    else if (state.wavePhase === 'victory') waveStatusEl.textContent = '✓ Victory!';
  }

  const btn = document.getElementById('btn-next-wave');
  if (btn) btn.disabled = state.wavePhase !== 'prep' || state.currentWave >= state.totalWaves || !!state.waveRewardDraft;
}

function getFortressHp() {
  const fortress = state.buildings.find(b => b.isHq);
  return fortress ? fortress.hp : 0;
}

// ── Build tab ─────────────────────────────────────────────────────────────────

export function renderBuildPanel(onSelectBuild) {
  const container = document.getElementById('build-list');
  if (!container) return;
  container.innerHTML = '';

  for (const defId of BUILD_ORDER) {
    const def = BUILDING_DEFINITIONS[defId];
    if (!def.placeable) continue;

    const locked      = def.requiresUnlock && !state.globalUnlocks.has(def.requiresUnlock);
    const costStr     = formatCost(def.cost);
    const canAfford   = !locked && canAffordCost(def.cost);

    const el  = document.createElement('div');
    el.className = 'build-item' + (locked ? ' locked' : (!canAfford ? ' insufficient' : ''));
    el.dataset.defId = defId;
    el.innerHTML = `
      <div class="bname">${def.name}</div>
      <div class="bcost">${costStr}</div>
      <div class="bdesc">${def.description || ''}</div>
    `;

    if (!locked) {
      el.addEventListener('click', () => {
        if (!canAffordCost(def.cost)) return;
        // Toggle
        const wasSelected = state.buildSelection === defId;
        state.buildSelection = wasSelected ? null : defId;
        document.querySelectorAll('.build-item').forEach(e => e.classList.remove('selected'));
        if (!wasSelected) el.classList.add('selected');
        onSelectBuild(state.buildSelection);
      });
    }

    container.appendChild(el);
  }
}

export function refreshBuildPanel() {
  // Just re-highlight selected item and update affordability
  document.querySelectorAll('.build-item').forEach(el => {
    const defId   = el.dataset.defId;
    const def     = BUILDING_DEFINITIONS[defId];
    const locked  = def.requiresUnlock && !state.globalUnlocks.has(def.requiresUnlock);
    const canAfford = !locked && canAffordCost(def.cost);
    el.classList.toggle('insufficient', !locked && !canAfford);
    el.classList.toggle('selected', state.buildSelection === defId);
  });
}

// ── Units tab ─────────────────────────────────────────────────────────────────

export function renderUnitsPanel(building) {
  const panel = document.getElementById('units-panel');
  if (!panel) return;

  if (!building || !building.producesUnits) {
    panel.innerHTML = '<p class="hint">Select a production building on the map to train units.</p>';
    return;
  }

  const branchId = building.trainableUnits[0];
  const branchDef = UNIT_BRANCHES[branchId] || {};
  panel.innerHTML = `<h3>${branchDef.label || 'Units'}</h3>`;
  syncBuildingLoadout(building);
  const loadout = building.loadoutSelection;
  const weaponOptions = getUnlockedEquipmentByType(branchId, 'weapon');
  const armorOptions = getUnlockedEquipmentByType(branchId, 'armor');
  const shieldOptions = getAllowedShields(loadout.weaponId, branchId);

  panel.appendChild(renderLoadoutSection('Weapon', weaponOptions, loadout.weaponId, id => {
    building.loadoutSelection.weaponId = id;
    if (!isShieldAllowed(id, building.loadoutSelection.shieldId)) {
      building.loadoutSelection.shieldId = null;
    }
    renderUnitsPanel(building);
  }));

  if (shieldOptions.length) {
    panel.appendChild(renderLoadoutSection('Shield', shieldOptions, loadout.shieldId, id => {
      building.loadoutSelection.shieldId = id;
      renderUnitsPanel(building);
    }, true));
  }

  panel.appendChild(renderLoadoutSection('Armor', armorOptions, loadout.armorId, id => {
    building.loadoutSelection.armorId = id;
    renderUnitsPanel(building);
  }, true));

  const loadoutIds = [loadout.weaponId, loadout.shieldId, loadout.armorId].filter(Boolean);
  const cfg = decodeUnit(branchId, loadoutIds);
  cfg.weaponId = loadout.weaponId;
  cfg.shieldId = loadout.shieldId;
  cfg.armorId = loadout.armorId;

  const weaponName = EQUIPMENT_DEFINITIONS[loadout.weaponId]?.name || 'Club';
  const shieldName = loadout.shieldId ? EQUIPMENT_DEFINITIONS[loadout.shieldId]?.name : 'No Shield';
  const armorName = loadout.armorId ? EQUIPMENT_DEFINITIONS[loadout.armorId]?.name : 'No Armor';
  const costStr = formatCost(cfg.cost);
  const canAfford = canAffordCost(cfg.cost) && (getPopulationUsed() + cfg.pop) <= state.popCap;
  const queueFull = building.productionQueue.length >= 5;

  const card = document.createElement('div');
  card.className = 'unit-card';
  card.innerHTML = `
    <div class="uname">${weaponName} ${branchDef.label || 'Soldier'}</div>
    <div class="ustats">Loadout: ${shieldName} | ${armorName}</div>
    <div class="ustats">HP:${cfg.hp} | DMG:${cfg.damage} ${cfg.attackType === 'pierce' ? '(RNG)' : '(MEL)'} | ARM:${cfg.meleeArmor}/${cfg.pierceArmor}</div>
    <div class="ustats">Shield:${cfg.shieldBlockMelee}/${cfg.shieldBlockPierce} | RNG:${cfg.range} | ATK/s:${cfg.attackSpeed.toFixed(2)} | SPD:${cfg.speed}</div>
    <div class="ucost">${costStr} | ${cfg.pop} pop | ${cfg.trainTime.toFixed(1)}s</div>
    <button ${(!canAfford || queueFull) ? 'disabled' : ''}>
      ${queueFull ? 'Queue Full' : !canAfford ? 'Insufficient' : 'Train'}
    </button>
  `;

  const btn = card.querySelector('button');
  btn.addEventListener('click', () => {
    const finalCfg = decodeUnit(branchId, loadoutIds);
    finalCfg.weaponId = loadout.weaponId;
    finalCfg.shieldId = loadout.shieldId;
    finalCfg.armorId = loadout.armorId;
    if (!canAffordCost(finalCfg.cost)) return;
    if ((getPopulationUsed() + finalCfg.pop) > state.popCap) return;
    spendCost(finalCfg.cost);
    building.productionQueue.push({
      unitConfig: finalCfg,
      timeLeft: finalCfg.trainTime,
      totalTime: finalCfg.trainTime,
    });
    renderUnitsPanel(building);
  });

  panel.appendChild(card);

  // Queue display
  if (building.productionQueue.length > 0) {
    const job      = building.productionQueue[0];
    const progress = 1 - job.timeLeft / job.totalTime;
    const queueDiv = document.createElement('div');
    queueDiv.className = 'queue-display';
    queueDiv.innerHTML = `
      Training: ${job.unitConfig.branch} (${building.productionQueue.length} queued)<br>
      <div class="queue-bar"><div class="queue-bar-fill" style="width:${(progress*100).toFixed(1)}%"></div></div>
    `;
    panel.appendChild(queueDiv);
  }
}

export function renderWaveRewardOverlay(onPick) {
  const overlay = document.getElementById('wave-reward-overlay');
  const panel = document.getElementById('wave-reward-panel');
  if (!overlay || !panel) return;

  const draft = state.waveRewardDraft;
  overlay.classList.toggle('active', !!draft);
  if (!draft) {
    panel.innerHTML = '';
    return;
  }

  panel.innerHTML = `
    <h3>Choose an Unlock</h3>
    <p>Pick one reward before the next wave begins.</p>
  `;

  for (const equipmentId of draft.choices) {
    const eq = EQUIPMENT_DEFINITIONS[equipmentId];
    if (!eq) continue;
    const card = document.createElement('button');
    card.className = 'reward-card';
    card.innerHTML = `
      <span class="reward-name">${eq.name}</span>
      <span class="reward-meta">${eq.type}</span>
      <span class="reward-desc">${eq.description}</span>
    `;
    card.addEventListener('click', () => onPick(equipmentId));
    panel.appendChild(card);
  }
}

// ── Tech tab ──────────────────────────────────────────────────────────────────

export function renderTechPanel(onResearch) {
  const panel = document.getElementById('tech-panel');
  if (!panel) return;
  panel.innerHTML = '';

  for (const cat of TECH_CATEGORIES) {
    const catDiv = document.createElement('div');
    catDiv.className = 'tech-category';
    catDiv.innerHTML = `<h4>${cat.label}</h4>`;

    for (const nodeId of cat.nodes) {
      const tech      = TECH_TREE[nodeId];
      const researched = state.researchedTech.has(nodeId);
      const inQueue    = state.researchQueue.some(j => j.nodeId === nodeId);
      const prereqsMet = (tech.prerequisites || []).every(p => state.researchedTech.has(p));
      const canAfford  = canAffordCost(tech.cost);
      const locked     = !prereqsMet && !researched;

      let cssClass = 'tech-node';
      if (researched) cssClass += ' researched';
      else if (inQueue) cssClass += ' researching';
      else if (locked)  cssClass += ' locked';

      const costStr   = formatCost(tech.cost);
      const statusStr = researched ? '✓ Done'
                      : inQueue   ? 'In Queue'
                      : locked    ? 'Locked'
                      : canAfford ? `${costStr} · ${tech.researchTime}s`
                      : `${costStr} · ${tech.researchTime}s`;

      const node = document.createElement('div');
      node.className = cssClass;
      node.innerHTML = `
        <div class="tname">${tech.name}</div>
        <div class="tdesc">${tech.description || ''}</div>
        <div class="tcost">${statusStr}</div>
        ${inQueue ? `<div class="tech-progress"><div class="tech-progress-fill" id="tp-${nodeId}" style="width:0%"></div></div>` : ''}
      `;

      if (!researched && !inQueue && !locked && canAfford) {
        node.addEventListener('click', () => onResearch(nodeId));
      }

      catDiv.appendChild(node);
    }

    panel.appendChild(catDiv);
  }
}

export function updateResearchProgress() {
  if (!state.researchQueue.length) return;
  const job     = state.researchQueue[0];
  const tech    = TECH_TREE[job.nodeId];
  if (!tech) return;
  const progress = 1 - job.timeRemaining / tech.researchTime;
  const fill = document.getElementById(`tp-${job.nodeId}`);
  if (fill) fill.style.width = `${(progress * 100).toFixed(1)}%`;
}

// ── Info bar ──────────────────────────────────────────────────────────────────

export function renderInfoBar(onAction) {
  const infoEl    = document.getElementById('selected-info');
  const actionsEl = document.getElementById('selected-actions');
  if (!infoEl || !actionsEl) return;

  actionsEl.innerHTML = '';
  const sel = state.selected;

  if (!sel) {
    infoEl.textContent = 'Click a tile or building to inspect it.';
    return;
  }

  if (sel.type === 'building') {
    const b   = sel.ref;
    const def = BUILDING_DEFINITIONS[b.defId];
    infoEl.innerHTML = `<b>${b.name}</b> &nbsp; HP: ${Math.ceil(b.hp)}/${b.maxHp}` +
      (b.towerStats ? (() => {
        const s = decodeTower(b, TOWER_DEFINITION, TECH_TREE);
        return ` &nbsp; Dmg:${s.damage} Spd:${s.attackSpeed.toFixed(1)} Cnt:${s.projectileCount} Rng:${s.range}`;
      })() : '');

    if (def?.upgrades?.length > 0) {
      const remainingUpgradeNames = def.upgrades
        .filter(u => !b.chosenUpgrades.includes(u))
        .map(u => TECH_TREE[u]?.name || u);
      const label = document.createElement('span');
      label.style.cssText = 'color:#78909c;font-size:0.78rem;margin-left:8px;';
      label.textContent = remainingUpgradeNames.length
        ? 'Upgrades: ' + remainingUpgradeNames.join(', ')
        : 'Upgrades: All applied';
      infoEl.appendChild(label);
    }

    // Tower: per-tower upgrade buttons
    if (b.towerStats) {
      const availableUpgrades = (def.upgrades || []).filter(u => {
        const t = TECH_TREE[u];
        if (!t) return false;
        if (b.chosenUpgrades.includes(u)) return false;
        return true;
      });
      for (const upId of availableUpgrades) {
        const tech = TECH_TREE[upId];
        const canAfford = canAffordCost(tech.cost);
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.textContent = `${tech.name} (${formatCost(tech.cost)})`;
        btn.disabled = !canAfford;
        btn.addEventListener('click', () => onAction('tower_upgrade', { building: b, techId: upId }));
        actionsEl.appendChild(btn);
      }
    }

    if (b.isHq) {
      const repairCost = getFortressRepairCost(b);
      const repairBtn = document.createElement('button');
      repairBtn.className = 'action-btn';
      repairBtn.textContent = b.hp >= b.maxHp
        ? 'Fully Repaired'
        : `Repair (${formatCost({ gold: repairCost })})`;
      repairBtn.disabled = b.hp >= b.maxHp || !canAffordCost({ gold: repairCost });
      repairBtn.addEventListener('click', () => onAction('repair_fortress', {
        building: b,
        cost: { gold: repairCost },
      }));
      actionsEl.appendChild(repairBtn);
    }

    // Sell button for non-HQ buildings
    if (!b.isHq) {
      const sellBtn = document.createElement('button');
      const def2    = BUILDING_DEFINITIONS[b.defId];
      const refund  = { gold: Math.floor((def2.cost.gold || 0) * 0.5) };
      sellBtn.className   = 'action-btn danger';
      sellBtn.textContent = `Sell (+${formatCost(refund)})`;
      sellBtn.addEventListener('click', () => onAction('sell', { building: b, refund }));
      actionsEl.appendChild(sellBtn);
    }

  } else if (sel.type === 'tile') {
    infoEl.textContent = `Empty tile (${sel.tx}, ${sel.ty})`;
  }
}

export function renderFortressPanel(onAction) {
  const overlay = document.getElementById('fortress-overlay');
  const body = document.getElementById('fortress-panel-body');
  if (!overlay || !body) return;

  const sel = state.selected;
  const fortress = sel?.type === 'building' && sel.ref?.isHq ? sel.ref : null;
  overlay.classList.toggle('active', !!fortress);
  if (!fortress) {
    body.innerHTML = '';
    return;
  }

  const stats = decodeTower(fortress, TOWER_DEFINITION, TECH_TREE);
  const def = BUILDING_DEFINITIONS[fortress.defId];
  const repairCost = getFortressRepairCost(fortress);
  const availableUpgrades = (def.upgrades || []).filter(upId => {
    const tech = TECH_TREE[upId];
    return tech && !fortress.chosenUpgrades.includes(upId);
  });
  const availableUpgradeNames = availableUpgrades.map(upId => TECH_TREE[upId]?.name || upId);

  body.innerHTML = `
    <div class="fortress-header">
      <h3>${fortress.name}</h3>
      <p>${def.description || ''}</p>
    </div>
    <div class="fortress-stats">
      HP: ${Math.ceil(fortress.hp)}/${fortress.maxHp} &nbsp;
      DMG: ${stats.damage} &nbsp;
      ATK/s: ${stats.attackSpeed.toFixed(2)} &nbsp;
      Volley: ${stats.projectileCount} &nbsp;
      Range: ${stats.range}
    </div>
    <div class="fortress-upgrades-label">
      Remaining upgrades: ${availableUpgradeNames.join(', ') || 'All applied'}
    </div>
    <div class="fortress-actions"></div>
  `;

  const actions = body.querySelector('.fortress-actions');
  if (!actions) return;

  const repairBtn = document.createElement('button');
  repairBtn.className = 'action-btn';
  repairBtn.textContent = fortress.hp >= fortress.maxHp
    ? 'Fully Repaired'
    : `Repair (${formatCost({ gold: repairCost })})`;
  repairBtn.disabled = fortress.hp >= fortress.maxHp || !canAffordCost({ gold: repairCost });
  repairBtn.addEventListener('click', () => onAction('repair_fortress', {
    building: fortress,
    cost: { gold: repairCost },
  }));
  actions.appendChild(repairBtn);

  for (const upId of availableUpgrades) {
    const tech = TECH_TREE[upId];
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.textContent = `${tech.name} (${formatCost(tech.cost)})`;
    btn.disabled = !canAffordCost(tech.cost);
    btn.addEventListener('click', () => onAction('tower_upgrade', { building: fortress, techId: upId }));
    actions.appendChild(btn);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCost(cost) {
  const parts = [];
  if (cost.gold)  parts.push(`${Math.ceil(cost.gold)}g`);
  return parts.join(' ') || 'Free';
}

function canAffordCost(cost) {
  return (state.resources.gold ?? 0) >= (cost.gold || 0);
}

function getFortressRepairCost(fortress) {
  const missingHp = Math.max(0, fortress.maxHp - fortress.hp);
  const costPerHp = BUILDING_DEFINITIONS.fortress.repairCostPerHp || 0.25;
  return Math.max(1, Math.ceil(missingHp * costPerHp));
}

function spendCost(cost) {
  state.resources.gold = (state.resources.gold || 0) - (cost.gold || 0);
}

function getPopulationUsed() {
  const unitPop = state.units.reduce((sum, unit) => sum + (unit.pop || 1), 0);
  const queuedPop = state.buildings.reduce((sum, building) => {
    return sum + building.productionQueue.reduce((queueSum, job) => queueSum + (job.unitConfig?.pop || 1), 0);
  }, 0);
  return unitPop + queuedPop;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function getUnlockedEquipmentByType(branchId, type) {
  return Object.values(EQUIPMENT_DEFINITIONS)
    .filter(eq => eq.branch === branchId && eq.type === type && state.unlockedEquipment.has(eq.id));
}

function syncBuildingLoadout(building) {
  if (!building.loadoutSelection) {
    building.loadoutSelection = { weaponId: null, shieldId: null, armorId: null };
  }

  const weapons = getUnlockedEquipmentByType('infantry', 'weapon');
  if (!building.loadoutSelection.weaponId || !state.unlockedEquipment.has(building.loadoutSelection.weaponId)) {
    building.loadoutSelection.weaponId = weapons[0]?.id || null;
  }

  if (!isShieldAllowed(building.loadoutSelection.weaponId, building.loadoutSelection.shieldId)) {
    building.loadoutSelection.shieldId = null;
  }

  if (building.loadoutSelection.armorId && !state.unlockedEquipment.has(building.loadoutSelection.armorId)) {
    building.loadoutSelection.armorId = null;
  }
}

function renderLoadoutSection(label, options, selectedId, onSelect, includeNone = false) {
  const wrap = document.createElement('div');
  wrap.className = 'loadout-group';

  const title = document.createElement('div');
  title.className = 'loadout-label';
  title.textContent = label;
  wrap.appendChild(title);

  const optionWrap = document.createElement('div');
  optionWrap.className = 'loadout-options';

  if (includeNone) {
    optionWrap.appendChild(createLoadoutButton('None', !selectedId, () => onSelect(null)));
  }

  for (const eq of options) {
    optionWrap.appendChild(createLoadoutButton(eq.name, selectedId === eq.id, () => onSelect(eq.id), eq.description));
  }

  wrap.appendChild(optionWrap);
  return wrap;
}

function createLoadoutButton(label, selected, onClick, title = '') {
  const btn = document.createElement('button');
  btn.className = 'loadout-btn' + (selected ? ' selected' : '');
  btn.textContent = label;
  if (title) btn.title = title;
  btn.addEventListener('click', onClick);
  return btn;
}

function getAllowedShields(weaponId, branchId) {
  if (!isShieldAllowed(weaponId, '__placeholder__')) return [];
  return getUnlockedEquipmentByType(branchId, 'shield');
}

function isShieldAllowed(weaponId, shieldId) {
  if (!shieldId || shieldId === '__placeholder__') {
    const weapon = EQUIPMENT_DEFINITIONS[weaponId];
    return weapon?.type === 'weapon' && weapon.weaponClass === 'melee' && weapon.hands === 1;
  }

  const weapon = EQUIPMENT_DEFINITIONS[weaponId];
  const shield = EQUIPMENT_DEFINITIONS[shieldId];
  return !!weapon && !!shield && shield.type === 'shield' && weapon.weaponClass === 'melee' && weapon.hands === 1;
}
