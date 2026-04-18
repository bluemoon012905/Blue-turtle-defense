// Canvas renderer — AoE-style medieval visuals

import state from '../systems/gameState.js';
import { BUILDING_DEFINITIONS } from '../data/buildings.js';
import { TOWER_DEFINITION }     from '../data/towers.js';
import { TECH_TREE }            from '../data/tech.js';
import { decodeTower }          from '../systems/decoder.js';

export class Renderer {
  constructor(canvas, map) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.map    = map;
    this.ghostTile  = null;
    this.ghostDefId = null;
    this._terrainSeed = this._buildTerrainSeed(map);
    this.camera = {
      x: 0,
      y: 0,
      zoom: 1.35,
      viewportWidth: canvas.width,
      viewportHeight: canvas.height,
    };
  }

  _buildTerrainSeed(map) {
    const seed = [];
    for (let ty = 0; ty < map.rows; ty++) {
      seed[ty] = [];
      for (let tx = 0; tx < map.cols; tx++) {
        seed[ty][tx] = (tx * 7919 + ty * 6271) % 100;
      }
    }
    return seed;
  }

  setGhost(tx, ty, defId) {
    this.ghostTile  = (tx !== null) ? { tx, ty } : null;
    this.ghostDefId = defId;
  }

  setViewport(width, height) {
    this.camera.viewportWidth = width;
    this.camera.viewportHeight = height;
    this._clampCamera();
  }

  setCamera(x, y) {
    this.camera.x = x;
    this.camera.y = y;
    this._clampCamera();
  }

  moveCamera(dx, dy) {
    this.setCamera(this.camera.x + dx, this.camera.y + dy);
  }

  centerOnWorld(px, py) {
    const screen = this.map.worldToScreen(px, py);
    this.setCamera(
      screen.x - this._viewportProjectedWidth() / 2,
      screen.y - this._viewportProjectedHeight() / 2,
    );
  }

  setZoom(zoom) {
    this.camera.zoom = Math.max(0.75, Math.min(2.25, zoom));
    this._clampCamera();
  }

  zoomAt(screenX, screenY, zoomFactor) {
    const prevZoom = this.camera.zoom;
    const nextZoom = Math.max(0.75, Math.min(2.25, prevZoom * zoomFactor));
    if (nextZoom === prevZoom) return;

    const focusX = this.camera.x + (screenX / prevZoom);
    const focusY = this.camera.y + (screenY / prevZoom);

    this.camera.zoom = nextZoom;
    this.camera.x = focusX - (screenX / nextZoom);
    this.camera.y = focusY - (screenY / nextZoom);
    this._clampCamera();
  }

  _viewportProjectedWidth() {
    return this.camera.viewportWidth / this.camera.zoom;
  }

  _viewportProjectedHeight() {
    return this.camera.viewportHeight / this.camera.zoom;
  }

  _clampCamera() {
    const maxX = Math.max(0, this.map.projectedWidth - this._viewportProjectedWidth());
    const maxY = Math.max(0, this.map.projectedHeight - this._viewportProjectedHeight());
    this.camera.x = Math.max(0, Math.min(this.camera.x, maxX));
    this.camera.y = Math.max(0, Math.min(this.camera.y, maxY));
  }

  draw() {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._drawTerrain();
    this._drawGhost();
    this._drawWorldActors();
    this._drawProjectiles();
    this._drawHealthBars();
    this._drawSelection();
    this._drawRangeCircle();
  }

  _withWorldTransform(drawFn) {
    const { ctx, map } = this;
    const { originX, originY, worldScaleX, worldScaleY } = map.projection;
    const { x: cameraX, y: cameraY, zoom } = this.camera;
    ctx.save();
    ctx.setTransform(
      worldScaleX * zoom,
      worldScaleY * zoom,
      -worldScaleX * zoom,
      worldScaleY * zoom,
      (originX - cameraX) * zoom,
      (originY - cameraY) * zoom,
    );
    drawFn();
    ctx.restore();
  }

  _projectWorld(px, py) {
    const screen = this.map.worldToScreen(px, py);
    const { x: cameraX, y: cameraY, zoom } = this.camera;
    return {
      x: (screen.x - cameraX) * zoom,
      y: (screen.y - cameraY) * zoom,
    };
  }

  // ── Terrain ──────────────────────────────────────────────────────────────────

  _drawTerrain() {
    const { ctx, map } = this;
    const { cols, rows, tileSize } = map;
    const seed = this._terrainSeed;
    const grass = ['#4a6e35', '#4e7238', '#456630', '#507a3c', '#486834', '#4c7036'];
    const spawnZone = map.spawnZoneTiles || 0;

    this._withWorldTransform(() => {
      for (let ty = 0; ty < rows; ty++) {
        for (let tx = 0; tx < cols; tx++) {
          const px = tx * tileSize;
          const py = ty * tileSize;
          const s  = seed[ty][tx];

          ctx.fillStyle = grass[s % grass.length];
          ctx.fillRect(px, py, tileSize, tileSize);

          if (spawnZone > 0 && map.isInSpawnZoneTile(tx, ty)) {
            ctx.fillStyle = 'rgba(150, 28, 20, 0.26)';
            ctx.fillRect(px, py, tileSize, tileSize);
          }

          if (s < 12) {
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(px, py, tileSize, tileSize);
          } else if (s > 88) {
            ctx.fillStyle = 'rgba(255,240,180,0.06)';
            ctx.fillRect(px, py, tileSize, tileSize);
          }

          if (s % 5 === 0) {
            ctx.fillStyle = 'rgba(90,150,40,0.4)';
            const bx = px + (s % 18) + 2;
            const by = py + ((s * 3) % 22) + 2;
            ctx.fillRect(bx,     by + 4, 1, 5);
            ctx.fillRect(bx + 3, by + 2, 1, 6);
            ctx.fillRect(bx + 6, by + 5, 1, 4);
          }

          if (s % 17 === 0) {
            ctx.fillStyle = 'rgba(110,90,60,0.45)';
            ctx.beginPath();
            ctx.arc(px + (s % 26) + 3, py + ((s * 5) % 26) + 3, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth   = 0.75;
      for (let ty = 0; ty <= rows; ty++) {
        ctx.beginPath(); ctx.moveTo(0, ty * tileSize); ctx.lineTo(map.width, ty * tileSize); ctx.stroke();
      }
      for (let tx = 0; tx <= cols; tx++) {
        ctx.beginPath(); ctx.moveTo(tx * tileSize, 0); ctx.lineTo(tx * tileSize, map.height); ctx.stroke();
      }
    });
  }

  // ── Ghost (placement preview) ─────────────────────────────────────────────

  _drawGhost() {
    if (!this.ghostTile || !this.ghostDefId) return;
    const { ctx, map } = this;
    const def = BUILDING_DEFINITIONS[this.ghostDefId];
    if (!def) return;

    const { tx, ty } = this.ghostTile;
    const canPlace   = map.canPlace(tx, ty, def.size);
    const px = tx * map.tileSize, py = ty * map.tileSize;
    const sz = def.size * map.tileSize;

    this._withWorldTransform(() => {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle   = canPlace ? 'rgba(100,160,50,0.35)' : 'rgba(160,40,30,0.4)';
      ctx.fillRect(px, py, sz, sz);
      ctx.strokeStyle = canPlace ? '#90c850' : '#d84030';
      ctx.lineWidth   = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(px + 1, py + 1, sz - 2, sz - 2);
      ctx.setLineDash([]);
      ctx.restore();
    });
  }

  // ── Buildings ─────────────────────────────────────────────────────────────

  _drawWorldActors() {
    const actors = [];

    for (const b of state.buildings) {
      actors.push({ type: 'building', depth: b.px + b.py + b.h, ref: b });
    }
    for (const e of state.enemies) {
      if (e.state !== 'dead') actors.push({ type: 'enemy', depth: e.x + e.y, ref: e });
    }
    for (const u of state.units) {
      if (u.state !== 'dead') actors.push({ type: 'unit', depth: u.x + u.y, ref: u });
    }

    actors.sort((a, b) => a.depth - b.depth);

    for (const actor of actors) {
      if (actor.type === 'building') this._drawBuilding(actor.ref);
      else if (actor.type === 'enemy') this._drawEnemy(actor.ref);
      else this._drawUnit(actor.ref);
    }
  }

  _drawBuilding(b) {
    const { ctx, map } = this;

    this._withWorldTransform(() => {
      ctx.fillStyle = 'rgba(18,12,8,0.26)';
      ctx.fillRect(b.px, b.py, b.w, b.h);
    });

    switch (b.defId) {
      case 'fortress':
        this._drawIsoFortress(b);
        break;
      case 'tower':
        this._drawIsoTower(b);
        break;
      case 'barracks':
        this._drawIsoHall(b, {
          roof: '#8a3a18',
          wallLeft: '#7a4e28',
          wallRight: '#63391d',
          trim: '#4a2a10',
          icon: 'melee',
        });
        break;
      case 'range_barracks':
        this._drawIsoHall(b, {
          roof: '#5a6a18',
          wallLeft: '#7a5828',
          wallRight: '#62451f',
          trim: '#3a4808',
          icon: 'ranged',
        });
        break;
      case 'stable':
        this._drawIsoHall(b, {
          roof: '#a07a30',
          wallLeft: '#6b4020',
          wallRight: '#563119',
          trim: '#3a2010',
          icon: 'stable',
        });
        break;
      case 'house':
        this._drawIsoHall(b, {
          roof: '#5d7b2e',
          wallLeft: '#8B5E3C',
          wallRight: '#734b30',
          trim: '#3a5020',
          icon: 'house',
        });
        break;
      case 'gold_mine':
        this._drawIsoMine(b);
        break;
      default:
        this._drawIsoBlock(b, {
          roof: '#8a7a6a',
          wallLeft: '#706352',
          wallRight: '#5a4a38',
          trim: '#3a3127',
          lift: 26,
        });
    }

    if (b.defId === 'tower') {
      const stats   = decodeTower(b, TOWER_DEFINITION, TECH_TREE);
      const rangePx = stats.range * map.tileSize;
      this._withWorldTransform(() => {
        ctx.beginPath();
        ctx.arc(b.px + b.w / 2, b.py + b.h / 2, rangePx, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200,168,67,0.1)';
        ctx.lineWidth   = 1;
        ctx.stroke();
      });
    }

    if (b.productionQueue.length > 0) {
      const job      = b.productionQueue[0];
      const progress = 1 - job.timeLeft / job.totalTime;
      const top = this._projectWorld(b.px + b.w / 2, b.py + b.h / 2);
      const bw = Math.max(28, b.w - 4);
      const bh = 5;
      const bx = top.x - bw / 2;
      const barY = top.y - 40;
      ctx.fillStyle = 'rgba(15,8,3,0.75)';
      ctx.fillRect(bx, barY, bw, bh);
      ctx.fillStyle = '#d4a843';
      ctx.fillRect(bx, barY, bw * progress, bh);
      ctx.strokeStyle = '#8B6914';
      ctx.lineWidth   = 1;
      ctx.strokeRect(bx, barY, bw, bh);
    }
  }

  _buildingScreenFootprint(b) {
    return {
      nw: this._projectWorld(b.px, b.py),
      ne: this._projectWorld(b.px + b.w, b.py),
      se: this._projectWorld(b.px + b.w, b.py + b.h),
      sw: this._projectWorld(b.px, b.py + b.h),
      center: this._projectWorld(b.px + b.w / 2, b.py + b.h / 2),
    };
  }

  _lifted(points, lift) {
    const result = {};
    for (const [key, point] of Object.entries(points)) {
      result[key] = key === 'center'
        ? { x: point.x, y: point.y - lift }
        : { x: point.x, y: point.y - lift };
    }
    return result;
  }

  _fillQuad(a, b, c, d, fillStyle, strokeStyle = null, lineWidth = 1) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  _fillPoly(points, fillStyle, strokeStyle = null, lineWidth = 1) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  _drawIsoBlock(b, palette) {
    const base = this._buildingScreenFootprint(b);
    const top = this._lifted(base, palette.lift);

    this._fillQuad(top.sw, top.se, base.se, base.sw, palette.wallLeft, palette.trim);
    this._fillQuad(top.ne, top.se, base.se, base.ne, palette.wallRight, palette.trim);
    this._fillPoly([top.nw, top.ne, top.se, top.sw], palette.roof, palette.trim, 1.25);

    const hpRatio = b.hp / b.maxHp;
    if (hpRatio < 1) {
      this._fillPoly([top.nw, top.ne, top.se, top.sw], `rgba(160,30,10,${(1 - hpRatio) * 0.32})`);
    }
  }

  _drawIsoHall(b, palette) {
    const base = this._buildingScreenFootprint(b);
    const wallLift = 18;
    const roofLift = 34;
    const wallTop = this._lifted(base, wallLift);
    const roofBase = this._lifted(base, roofLift);
    const ridgeFront = {
      x: (roofBase.sw.x + roofBase.se.x) / 2,
      y: Math.min(roofBase.sw.y, roofBase.se.y) - 12,
    };
    const ridgeBack = {
      x: (roofBase.nw.x + roofBase.ne.x) / 2,
      y: Math.min(roofBase.nw.y, roofBase.ne.y) - 12,
    };

    this._fillQuad(wallTop.sw, wallTop.se, base.se, base.sw, palette.wallLeft, palette.trim);
    this._fillQuad(wallTop.ne, wallTop.se, base.se, base.ne, palette.wallRight, palette.trim);
    this._fillPoly([roofBase.nw, ridgeBack, ridgeFront, roofBase.sw], palette.roof, palette.trim, 1.25);
    this._fillPoly([ridgeBack, roofBase.ne, roofBase.se, ridgeFront], this._shade(palette.roof, -18), palette.trim, 1.25);

    this._drawBuildingDoor(base.center.x, base.se.y - 20, palette.trim);
    this._drawBuildingIcon(base.center.x, wallTop.center.y + 2, palette.icon, palette.trim);

    const hpRatio = b.hp / b.maxHp;
    if (hpRatio < 1) {
      this._fillPoly([roofBase.nw, ridgeBack, ridgeFront, roofBase.sw], `rgba(160,30,10,${(1 - hpRatio) * 0.28})`);
      this._fillPoly([ridgeBack, roofBase.ne, roofBase.se, ridgeFront], `rgba(160,30,10,${(1 - hpRatio) * 0.22})`);
    }
  }

  _drawIsoTower(b) {
    const base = this._buildingScreenFootprint(b);
    const top = this._lifted(base, 44);

    this._fillQuad(top.sw, top.se, base.se, base.sw, '#7a7665', '#4a4436');
    this._fillQuad(top.ne, top.se, base.se, base.ne, '#6a6658', '#4a4436');
    this._fillPoly([top.nw, top.ne, top.se, top.sw], '#8e8a78', '#4a4436', 1.25);

    const battlementInset = 6;
    this._fillPoly([
      { x: top.nw.x + battlementInset, y: top.nw.y + 1 },
      { x: top.ne.x - battlementInset, y: top.ne.y + 1 },
      { x: top.se.x - battlementInset, y: top.se.y - 1 },
      { x: top.sw.x + battlementInset, y: top.sw.y - 1 },
    ], '#9c9886', '#5a5444', 1);

    const slit = this._projectWorld(b.px + b.w / 2, b.py + b.h / 2);
    this.ctx.fillStyle = '#1a1208';
    this.ctx.fillRect(slit.x - 2, slit.y - 22, 4, 16);
  }

  _drawIsoFortress(b) {
    this._drawIsoBlock(b, {
      roof: '#7a8090',
      wallLeft: '#696f7e',
      wallRight: '#5d6370',
      trim: '#4a5060',
      lift: 34,
    });

    const corners = [
      { px: b.px, py: b.py },
      { px: b.px + b.w - 14, py: b.py },
      { px: b.px + b.w - 14, py: b.py + b.h - 14 },
      { px: b.px, py: b.py + b.h - 14 },
    ];
    for (const tower of corners) {
      this._drawIsoBlock({ ...b, px: tower.px, py: tower.py, w: 14, h: 14, hp: b.hp, maxHp: b.maxHp }, {
        roof: '#8890a2',
        wallLeft: '#757d8f',
        wallRight: '#646c7f',
        trim: '#4a5060',
        lift: 48,
      });
    }

    const gate = this._projectWorld(b.px + b.w / 2, b.py + b.h);
    this.ctx.fillStyle = '#221608';
    this.ctx.beginPath();
    this.ctx.moveTo(gate.x - 9, gate.y - 2);
    this.ctx.lineTo(gate.x + 9, gate.y - 2);
    this.ctx.lineTo(gate.x + 7, gate.y - 20);
    this.ctx.lineTo(gate.x - 7, gate.y - 20);
    this.ctx.closePath();
    this.ctx.fill();
  }

  _drawIsoMine(b) {
    const base = this._buildingScreenFootprint(b);
    const ridge = {
      x: base.center.x,
      y: base.center.y - 30,
    };
    const ridgeRight = {
      x: (base.ne.x + base.se.x) / 2,
      y: ((base.ne.y + base.se.y) / 2) - 18,
    };

    this._fillPoly([base.nw, base.ne, ridgeRight, ridge, base.sw], '#4a3a1c', '#3a2c14', 1.25);
    this._fillPoly([ridge, ridgeRight, base.se, base.sw], '#3a2c14', '#2a2010', 1.25);

    this.ctx.fillStyle = '#1a1008';
    this.ctx.beginPath();
    this.ctx.ellipse(base.center.x, base.se.y - 16, 14, 10, 0, Math.PI, 0, true);
    this.ctx.lineTo(base.center.x + 14, base.se.y + 1);
    this.ctx.lineTo(base.center.x - 14, base.se.y + 1);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = '#d4a843';
    for (const offset of [[-16, -16], [4, -20], [12, -10], [-4, -8]]) {
      this.ctx.fillRect(base.center.x + offset[0], base.center.y + offset[1], 3, 3);
    }
  }

  _drawBuildingDoor(x, y, trim) {
    this.ctx.fillStyle = '#26140a';
    this.ctx.fillRect(x - 5, y - 2, 10, 12);
    this.ctx.strokeStyle = trim;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x - 5, y - 2, 10, 12);
  }

  _drawBuildingIcon(x, y, type, color) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;

    if (type === 'melee') {
      ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(-6, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -1); ctx.lineTo(-2, -1); ctx.stroke();
      ctx.beginPath(); ctx.arc(-6, 8, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(4, -7); ctx.lineTo(10, -7); ctx.lineTo(10, 3); ctx.lineTo(7, 8); ctx.lineTo(4, 3);
      ctx.closePath(); ctx.stroke();
    } else if (type === 'ranged') {
      ctx.beginPath(); ctx.arc(0, 0, 8, -Math.PI * 0.65, Math.PI * 0.65); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
    } else if (type === 'stable') {
      ctx.beginPath(); ctx.ellipse(0, 2, 7, 5, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-2, -10, 4, 10);
    } else if (type === 'house') {
      ctx.beginPath();
      ctx.moveTo(-8, 1); ctx.lineTo(0, -7); ctx.lineTo(8, 1); ctx.lineTo(8, 8); ctx.lineTo(-8, 8);
      ctx.closePath();
      ctx.stroke();
      ctx.fillRect(-2, 2, 4, 6);
    }

    ctx.restore();
  }

  _shade(hex, delta) {
    const value = hex.replace('#', '');
    const parts = value.length === 3
      ? value.split('').map(ch => parseInt(ch + ch, 16))
      : [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)].map(part => parseInt(part, 16));
    const shaded = parts
      .map(channel => Math.max(0, Math.min(255, channel + delta)))
      .map(channel => channel.toString(16).padStart(2, '0'))
      .join('');
    return `#${shaded}`;
  }

  // ── Building drawers ──────────────────────────────────────────────────────

  _stoneBricks(px, py, w, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(50,44,32,0.45)';
    ctx.lineWidth = 0.5;
    for (let row = 0; row * 8 <= h; row++) {
      const ry = py + row * 8;
      ctx.beginPath(); ctx.moveTo(px, ry); ctx.lineTo(px + w, ry); ctx.stroke();
      const off = row % 2 === 0 ? 0 : 8;
      for (let x = px + off; x < px + w; x += 16) {
        ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x, Math.min(ry + 8, py + h)); ctx.stroke();
      }
    }
    ctx.restore();
  }

  _woodPlanks(px, py, w, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(40,18,5,0.3)';
    ctx.lineWidth = 0.5;
    for (let x = px + 8; x < px + w; x += 8) {
      ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x, py + h); ctx.stroke();
    }
    ctx.restore();
  }

  _drawTower(px, py, w, h) {
    const ctx = this.ctx;

    // Stone base
    ctx.fillStyle = '#7e7a68';
    ctx.fillRect(px, py + 3, w, h - 3);

    ctx.fillStyle = '#8e8a78';
    ctx.fillRect(px, py + 3, w, 10);

    this._stoneBricks(px, py + 3, w, h - 3);

    // Arrow slit
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(px + w / 2 - 2, py + Math.floor(h * 0.4), 4, 11);
    ctx.fillRect(px + w / 2 - 5, py + Math.floor(h * 0.52), 10, 4);

    // Battlements
    ctx.fillStyle = '#8e8a78';
    const mw = 7, mg = 4;
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(px + 2 + i * (mw + mg), py - 4, mw, 7);
    }
    // Battlement borders
    ctx.strokeStyle = '#5a5444';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) {
      ctx.strokeRect(px + 2 + i * (mw + mg), py - 4, mw, 7);
    }

    ctx.strokeStyle = '#4a4436';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  }

  _drawFortress(px, py, w, h) {
    const ctx = this.ctx;
    const ts = 16; // corner tower size

    // Main keep
    ctx.fillStyle = '#696f7e';
    ctx.fillRect(px + ts - 2, py + ts - 2, w - ts * 2 + 4, h - ts * 2 + 4);
    this._stoneBricks(px + ts - 2, py + ts - 2, w - ts * 2 + 4, h - ts * 2 + 4);

    // Corner towers
    const corners = [
      [px, py], [px + w - ts, py],
      [px, py + h - ts], [px + w - ts, py + h - ts],
    ];
    for (const [cx, cy] of corners) {
      ctx.fillStyle = '#7a8090';
      ctx.fillRect(cx, cy, ts, ts);
      this._stoneBricks(cx, cy, ts, ts);
      ctx.strokeStyle = '#4a5060';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, cy + 0.5, ts - 1, ts - 1);
      // Corner battlements
      ctx.fillStyle = '#7a8090';
      ctx.fillRect(cx + 1,    cy - 3, 5, 4);
      ctx.fillRect(cx + ts - 6, cy - 3, 5, 4);
    }

    // Gate (arched entrance)
    const gw = 13, gh = 16;
    const gx = px + w / 2 - gw / 2;
    const gy = py + h - gh;
    ctx.fillStyle = '#221608';
    ctx.fillRect(gx, gy, gw, gh);
    ctx.beginPath();
    ctx.arc(px + w / 2, gy, gw / 2, Math.PI, 0);
    ctx.fill();
    // Gate portcullis hint
    ctx.strokeStyle = '#4a3010';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(gx + 3 + i * 4, gy);
      ctx.lineTo(gx + 3 + i * 4, gy + gh);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(gx, gy + gh / 2);
    ctx.lineTo(gx + gw, gy + gh / 2);
    ctx.stroke();

    // Flag pole and banner
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + w / 2, py + 1);
    ctx.lineTo(px + w / 2, py + 18);
    ctx.stroke();
    ctx.fillStyle = '#cc2020';
    ctx.beginPath();
    ctx.moveTo(px + w / 2 + 1, py + 2);
    ctx.lineTo(px + w / 2 + 12, py + 7);
    ctx.lineTo(px + w / 2 + 1, py + 12);
    ctx.closePath();
    ctx.fill();

    // Gold fortress border
    ctx.strokeStyle = '#c8a843';
    ctx.lineWidth   = 2;
    ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  }

  _drawBarracks(px, py, w, h) {
    const ctx = this.ctx;

    // Walls
    ctx.fillStyle = '#7a4e28';
    ctx.fillRect(px, py + h * 0.28, w, h * 0.72);
    this._woodPlanks(px, py + h * 0.28, w, h * 0.72);

    // Roof (triangular)
    ctx.fillStyle = '#8a3a18';
    ctx.beginPath();
    ctx.moveTo(px - 3, py + h * 0.28);
    ctx.lineTo(px + w + 3, py + h * 0.28);
    ctx.lineTo(px + w / 2, py + 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5a2210';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(px - 3, py + h * 0.28);
    ctx.lineTo(px + w / 2, py + 3);
    ctx.lineTo(px + w + 3, py + h * 0.28);
    ctx.stroke();

    // Door
    const dw = 10, dh = 14;
    const dx = px + w / 2 - dw / 2, dy = py + h - dh;
    ctx.fillStyle = '#321808';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.beginPath();
    ctx.arc(px + w / 2, dy, dw / 2, Math.PI, 0);
    ctx.fill();

    // Sword & shield icon
    ctx.save();
    ctx.strokeStyle = 'rgba(210,190,120,0.75)';
    ctx.fillStyle   = 'rgba(210,190,120,0.75)';
    ctx.lineWidth   = 1.5;
    const ix = px + w * 0.4, iy = py + h * 0.55;
    // Sword
    ctx.beginPath(); ctx.moveTo(ix, iy - 9); ctx.lineTo(ix, iy + 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ix - 5, iy - 2); ctx.lineTo(ix + 5, iy - 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(ix, iy + 9, 2, 0, Math.PI * 2); ctx.fill();
    // Shield
    ctx.strokeStyle = 'rgba(180,160,90,0.7)';
    ctx.beginPath();
    ctx.moveTo(ix + 9, iy - 8);
    ctx.lineTo(ix + 15, iy - 8);
    ctx.lineTo(ix + 15, iy + 4);
    ctx.lineTo(ix + 12, iy + 9);
    ctx.lineTo(ix + 9,  iy + 4);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#4a2a10';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  }

  _drawRangeBarracks(px, py, w, h) {
    const ctx = this.ctx;

    ctx.fillStyle = '#7a5828';
    ctx.fillRect(px, py + h * 0.28, w, h * 0.72);
    this._woodPlanks(px, py + h * 0.28, w, h * 0.72);

    ctx.fillStyle = '#5a6a18';
    ctx.beginPath();
    ctx.moveTo(px - 3, py + h * 0.28);
    ctx.lineTo(px + w + 3, py + h * 0.28);
    ctx.lineTo(px + w / 2, py + 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3a4808';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(px - 3, py + h * 0.28);
    ctx.lineTo(px + w / 2, py + 3);
    ctx.lineTo(px + w + 3, py + h * 0.28);
    ctx.stroke();

    const dw = 10, dh = 14;
    const dx = px + w / 2 - dw / 2, dy = py + h - dh;
    ctx.fillStyle = '#322008';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.beginPath();
    ctx.arc(px + w / 2, dy, dw / 2, Math.PI, 0);
    ctx.fill();

    // Bow icon
    ctx.save();
    ctx.strokeStyle = 'rgba(210,190,120,0.75)';
    ctx.lineWidth   = 2;
    const bx = px + w * 0.42, by = py + h * 0.52;
    ctx.beginPath();
    ctx.arc(bx, by, 10, -Math.PI * 0.65, Math.PI * 0.65);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(210,190,120,0.5)';
    ctx.lineWidth   = 0.8;
    const a1 = -Math.PI * 0.65, a2 = Math.PI * 0.65;
    ctx.beginPath();
    ctx.moveTo(bx + 10 * Math.cos(a1), by + 10 * Math.sin(a1));
    ctx.lineTo(bx + 10 * Math.cos(a2), by + 10 * Math.sin(a2));
    ctx.stroke();
    // Arrow on bow
    ctx.strokeStyle = 'rgba(180,160,90,0.8)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(bx - 10, by);
    ctx.lineTo(bx + 10, by);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#4a3810';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  }

  _drawStable(px, py, w, h) {
    const ctx = this.ctx;

    ctx.fillStyle = '#6b4020';
    ctx.fillRect(px, py + h * 0.22, w, h * 0.78);
    this._woodPlanks(px, py + h * 0.22, w, h * 0.78);

    // Thatched roof
    ctx.fillStyle = '#a07a30';
    ctx.fillRect(px - 2, py + h * 0.15, w + 4, h * 0.15);
    ctx.strokeStyle = '#7a5a18';
    ctx.lineWidth = 0.5;
    for (let x = px; x < px + w; x += 6) {
      ctx.beginPath(); ctx.moveTo(x, py + h * 0.15); ctx.lineTo(x + 3, py + h * 0.3); ctx.stroke();
    }

    // Stall divider
    ctx.strokeStyle = '#3a2008';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + w / 2, py + h * 0.32);
    ctx.lineTo(px + w / 2, py + h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px, py + h * 0.6);
    ctx.lineTo(px + w, py + h * 0.6);
    ctx.stroke();

    // Horse head silhouette (left stall)
    ctx.fillStyle = '#8B6340';
    ctx.save();
    ctx.translate(px + w * 0.25, py + h * 0.52);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-3, -14, 5, 14);
    ctx.fillStyle = '#5a3a18';
    ctx.beginPath(); ctx.arc(-1, -3, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#3a2010';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  }

  _drawHouse(px, py, w, h) {
    const ctx = this.ctx;

    ctx.fillStyle = '#4e7030';
    ctx.fillRect(px, py, w, h);

    // House body
    ctx.fillStyle = '#8B5E3C';
    ctx.fillRect(px + 10, py + 18, w - 20, h - 20);
    this._woodPlanks(px + 10, py + 28, w - 20, h - 30);

    // Roof
    ctx.fillStyle = '#7a3a18';
    ctx.beginPath();
    ctx.moveTo(px + 6, py + 18);
    ctx.lineTo(px + w - 6, py + 18);
    ctx.lineTo(px + w / 2, py + 6);
    ctx.closePath();
    ctx.fill();

    // Door and windows
    ctx.fillStyle = '#221008';
    ctx.fillRect(px + w / 2 - 4, py + h - 14, 8, 12);
    ctx.fillStyle = '#d8c18a';
    ctx.fillRect(px + 16, py + 28, 7, 7);
    ctx.fillRect(px + w - 23, py + 28, 7, 7);

    ctx.strokeStyle = '#3a5020';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  }

  _drawLumberMill(px, py, w, h) {
    const ctx = this.ctx;

    ctx.fillStyle = '#4a3010';
    ctx.fillRect(px, py, w, h);

    // Mill building body
    ctx.fillStyle = '#7a4e28';
    ctx.fillRect(px + 12, py + 18, w - 24, h - 26);
    this._woodPlanks(px + 12, py + 26, w - 24, h - 34);
    ctx.fillStyle = '#5a3218';
    ctx.beginPath();
    ctx.moveTo(px + 8, py + 18);
    ctx.lineTo(px + w - 8, py + 18);
    ctx.lineTo(px + w / 2, py + 8);
    ctx.closePath();
    ctx.fill();

    // Log pile (end-on circles)
    const logCols = ['#8B4513', '#A0522D', '#7a3c10', '#954e26'];
    const logs = [[5,h-8], [12,h-8], [19,h-8], [26,h-8],
                  [8,h-15], [15,h-15], [22,h-15]];
    for (const [lx, ly] of logs) {
      ctx.fillStyle = logCols[(lx + ly) % logCols.length];
      ctx.beginPath();
      ctx.ellipse(px + lx, py + ly, 4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a1a08';
      ctx.lineWidth   = 0.6;
      ctx.stroke();
      // Ring on log end
      ctx.beginPath();
      ctx.ellipse(px + lx, py + ly, 2, 2.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = '#3a2010';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  }

  _drawGoldMine(px, py, w, h) {
    const ctx = this.ctx;

    ctx.fillStyle = '#3e3018';
    ctx.fillRect(px, py, w, h);

    // Rocky surface
    ctx.fillStyle = '#4a3a1c';
    ctx.beginPath();
    ctx.moveTo(px + 5, py + 12); ctx.lineTo(px + 22, py + 6);
    ctx.lineTo(px + 38, py + 10); ctx.lineTo(px + w - 4, py + 18);
    ctx.lineTo(px + w - 2, py + 30); ctx.lineTo(px + 2, py + 28);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a2c14';
    ctx.beginPath();
    ctx.moveTo(px + 15, py + 20); ctx.lineTo(px + w - 10, py + 16);
    ctx.lineTo(px + w - 6, py + 32); ctx.lineTo(px + 18, py + 34);
    ctx.closePath(); ctx.fill();

    // Cave entrance arch
    ctx.fillStyle = '#1a1008';
    const cw = 26, ch = 18;
    const cx2 = px + w / 2;
    ctx.beginPath();
    ctx.arc(cx2, py + h - ch, cw / 2, Math.PI, 0);
    ctx.lineTo(cx2 + cw / 2, py + h + 2);
    ctx.lineTo(cx2 - cw / 2, py + h + 2);
    ctx.closePath(); ctx.fill();

    // Gold ore flecks
    ctx.fillStyle = '#d4a843';
    const flecks = [[8,14],[18,10],[28,16],[40,20],[12,26],[34,28],[22,8],[48,14]];
    for (const [fx, fy] of flecks) {
      if (fx < w - 2 && fy < h - 2) {
        ctx.fillRect(px + fx, py + fy, 2, 2);
      }
    }
    ctx.fillStyle = 'rgba(212,168,67,0.5)';
    for (const [fx, fy] of flecks) {
      if (fx + 4 < w && fy + 4 < h) {
        ctx.fillRect(px + fx + 2, py + fy + 3, 1, 1);
      }
    }

    // Pickaxe symbol
    ctx.save();
    ctx.strokeStyle = 'rgba(200,180,120,0.75)';
    ctx.fillStyle   = 'rgba(200,180,120,0.75)';
    ctx.lineWidth   = 1.5;
    const ax = px + w * 0.72, ay = py + h * 0.35;
    ctx.beginPath(); ctx.moveTo(ax - 10, ay + 8); ctx.lineTo(ax + 8, ay - 8); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax + 5, ay - 10);
    ctx.lineTo(ax + 10, ay - 4);
    ctx.lineTo(ax + 8, ay - 8);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#6a5828';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  }

  // ── Projectiles (arrows) ───────────────────────────────────────────────────

  _drawProjectiles() {
    const ctx = this.ctx;
    for (const p of state.projectiles) {
      const hastarget = p.target && p.target.state !== 'dead';
      const start = this._projectWorld(p.x, p.y);
      const end = hastarget ? this._projectWorld(p.target.x, p.target.y) : null;
      const ang = hastarget
        ? Math.atan2(end.y - start.y, end.x - start.x)
        : 0;

      ctx.save();
      ctx.translate(start.x, start.y);
      ctx.rotate(ang);

      // Shaft
      ctx.strokeStyle = '#8B6914';
      ctx.lineWidth   = 1.5;
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(4, 0); ctx.stroke();

      // Head
      ctx.fillStyle = '#d4a843';
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(1, -2.5);
      ctx.lineTo(9, 0);
      ctx.lineTo(1, 2.5);
      ctx.closePath(); ctx.fill();

      // Fletching
      ctx.fillStyle = '#cc3820';
      ctx.beginPath();
      ctx.moveTo(-7, 0); ctx.lineTo(-4, -2.5); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-7, 0); ctx.lineTo(-4, 2.5); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();

      ctx.restore();
    }
  }

  // ── Enemies ───────────────────────────────────────────────────────────────

  _drawEnemies() {
    for (const e of state.enemies) {
      if (e.state === 'dead') continue;
      this._drawEnemy(e);
    }
  }

  _drawEnemy(e) {
    switch (e.defId) {
      case 'goblin':      this._drawGoblin(e);       break;
      case 'orc':         this._drawOrc(e);          break;
      case 'wolf_rider':  this._drawWolfRider(e);    break;
      case 'troll':       this._drawTroll(e);        break;
      case 'dark_knight': this._drawDarkKnight(e);   break;
      default:            this._drawGenericEnemy(e); break;
    }

    if (e.inSpawnZone) {
      this._drawSpawnZoneEnemyTint(e);
    }
  }

  _drawSpawnZoneEnemyTint(e) {
    const ctx = this.ctx;
    const { x, y } = this._projectWorld(e.x, e.y);
    const r = e.size * 1.35;

    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(220, 36, 28, 0.55)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 90, 70, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y + e.size * 0.1, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawGoblin(e) {
    const ctx = this.ctx;
    const { x, y } = this._projectWorld(e.x, e.y);
    const { size: s } = e;

    ctx.fillStyle = '#3a8a2a';
    ctx.beginPath(); ctx.arc(x, y + 2, s * 0.8, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#4aaa36';
    ctx.beginPath(); ctx.arc(x, y - s * 0.25, s * 0.62, 0, Math.PI * 2); ctx.fill();

    // Ears
    ctx.fillStyle = '#3a8a2a';
    const ep = [[x - s * 0.6, y - s * 0.25, x - s * 0.95, y - s * 0.9, x - s * 0.25, y - s * 0.5],
                [x + s * 0.6, y - s * 0.25, x + s * 0.95, y - s * 0.9, x + s * 0.25, y - s * 0.5]];
    for (const [ax, ay, bx, by, cx2, cy2] of ep) {
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx2, cy2); ctx.closePath(); ctx.fill();
    }

    ctx.fillStyle = '#ff2020';
    ctx.beginPath(); ctx.arc(x - s * 0.24, y - s * 0.3, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s * 0.24, y - s * 0.3, 1.5, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#1a4a10'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y - s * 0.25, s * 0.62, 0, Math.PI * 2); ctx.stroke();
  }

  _drawOrc(e) {
    const ctx = this.ctx;
    const { x, y } = this._projectWorld(e.x, e.y);
    const { size: s } = e;

    ctx.fillStyle = '#9a5a20';
    ctx.beginPath(); ctx.ellipse(x, y + 3, s, s * 0.85, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#b06a28';
    ctx.beginPath(); ctx.arc(x, y - s * 0.18, s * 0.72, 0, Math.PI * 2); ctx.fill();

    // Armor
    ctx.fillStyle = '#5a5040';
    ctx.fillRect(x - s * 0.5, y + 1, s, s * 0.35);

    ctx.fillStyle = '#ffcc00';
    ctx.beginPath(); ctx.arc(x - s * 0.3, y - s * 0.22, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s * 0.3, y - s * 0.22, 2, 0, Math.PI * 2); ctx.fill();

    // Tusks
    ctx.fillStyle = '#e8e0c0';
    ctx.fillRect(x - s * 0.25, y + s * 0.08, 3, 6);
    ctx.fillRect(x + s * 0.12, y + s * 0.08, 3, 6);

    ctx.strokeStyle = '#5a3010'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y - s * 0.18, s * 0.72, 0, Math.PI * 2); ctx.stroke();
  }

  _drawWolfRider(e) {
    const ctx = this.ctx;
    const { x, y } = this._projectWorld(e.x, e.y);
    const { size: s } = e;

    // Wolf body
    ctx.fillStyle = '#c07830';
    ctx.beginPath(); ctx.ellipse(x, y + 2, s * 1.1, s * 0.6, -0.15, 0, Math.PI * 2); ctx.fill();

    // Wolf head
    ctx.fillStyle = '#d08840';
    ctx.beginPath(); ctx.ellipse(x + s * 0.75, y - s * 0.08, s * 0.52, s * 0.42, 0.3, 0, Math.PI * 2); ctx.fill();

    // Wolf snout
    ctx.fillStyle = '#c07030';
    ctx.beginPath(); ctx.ellipse(x + s * 1.05, y + s * 0.05, s * 0.28, s * 0.2, 0.5, 0, Math.PI * 2); ctx.fill();

    // Rider body
    ctx.fillStyle = '#3a4a28';
    ctx.beginPath(); ctx.ellipse(x - s * 0.1, y - s * 0.5, s * 0.42, s * 0.52, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#ffcc00';
    ctx.beginPath(); ctx.arc(x + s * 0.88, y - s * 0.12, 1.5, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#7a4810'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y + 2, s * 1.1, s * 0.6, -0.15, 0, Math.PI * 2); ctx.stroke();
  }

  _drawTroll(e) {
    const ctx = this.ctx;
    const { x, y } = this._projectWorld(e.x, e.y);
    const { size: s } = e;

    ctx.fillStyle = '#5a3a8a';
    ctx.beginPath(); ctx.ellipse(x, y + 4, s * 0.88, s * 1.05, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#6a4a9a';
    ctx.beginPath(); ctx.arc(x - 2, y - s * 0.48, s * 0.78, 0, Math.PI * 2); ctx.fill();

    // Club arm
    ctx.fillStyle = '#4a2a7a';
    ctx.fillRect(x + s * 0.48, y - s * 0.18, s * 0.6, s * 0.24);
    ctx.fillStyle = '#7a5a3a';
    ctx.beginPath(); ctx.arc(x + s * 1.08 + 2, y - s * 0.1, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a3c20'; ctx.lineWidth = 1; ctx.stroke();

    ctx.fillStyle = '#ffff00';
    ctx.beginPath(); ctx.arc(x - s * 0.34, y - s * 0.52, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s * 0.18, y - s * 0.52, 2.5, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#2a1a5a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x - 2, y - s * 0.48, s * 0.78, 0, Math.PI * 2); ctx.stroke();
  }

  _drawDarkKnight(e) {
    const ctx = this.ctx;
    const { x, y } = this._projectWorld(e.x, e.y);
    const { size: s } = e;

    ctx.fillStyle = '#18181e';
    ctx.beginPath(); ctx.ellipse(x, y + 3, s * 0.88, s * 0.98, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#242430';
    ctx.beginPath(); ctx.arc(x, y - s * 0.44, s * 0.72, 0, Math.PI * 2); ctx.fill();

    // Visor slits
    ctx.fillStyle = '#ff2020';
    ctx.fillRect(x - s * 0.38, y - s * 0.48, s * 0.28, 3);
    ctx.fillRect(x + s * 0.06, y - s * 0.48, s * 0.28, 3);

    // Sword
    ctx.save();
    ctx.translate(x + s * 0.65, y - s * 0.1);
    ctx.rotate(-0.45);
    ctx.fillStyle = '#8090c0';
    ctx.fillRect(-1.5, -s, 3, s * 1.5);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(-5, -s * 0.3, 10, 2.5);
    ctx.restore();

    // Metallic sheen
    ctx.fillStyle = 'rgba(140,150,200,0.2)';
    ctx.beginPath(); ctx.ellipse(x - s * 0.18, y - s * 0.08, s * 0.36, s * 0.56, -0.3, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#3838a0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y - s * 0.44, s * 0.72, 0, Math.PI * 2); ctx.stroke();
  }

  _drawGenericEnemy(e) {
    const ctx = this.ctx;
    const { x, y } = this._projectWorld(e.x, e.y);
    ctx.beginPath();
    ctx.arc(x, y, e.size, 0, Math.PI * 2);
    ctx.fillStyle = e.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle   = 'rgba(255,255,255,0.9)';
    ctx.font        = 'bold 8px sans-serif';
    ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e.name[0], x, y);
  }

  // ── Units ─────────────────────────────────────────────────────────────────

  _drawUnits() {
    for (const u of state.units) {
      if (u.state === 'dead') continue;
      this._drawUnit(u);
    }
  }

  _drawUnit(u) {
    switch (u.branch) {
      case 'infantry': this._drawInfantry(u);   break;
      case 'ranged':   this._drawRangedUnit(u); break;
      case 'cavalry':  this._drawCavalry(u);    break;
      default: {
        const ctx = this.ctx;
        const pos = this._projectWorld(u.x, u.y);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.beginPath();
        ctx.moveTo(0, -u.size);
        ctx.lineTo(u.size * 0.7, u.size * 0.6);
        ctx.lineTo(-u.size * 0.7, u.size * 0.6);
        ctx.closePath();
        ctx.fillStyle = u.color;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  _drawInfantry(u) {
    const ctx = this.ctx;
    const { x, y } = this._projectWorld(u.x, u.y);
    const { size: s } = u;
    const hasShield = !!u.shieldId;
    const weaponId = u.weaponId || 'club';
    const armorTint = u.armorId?.includes('heavy') ? '#7a7f88'
      : u.armorId?.includes('medium') ? '#8a7150'
      : u.armorId ? '#6f5b45'
      : '#4277b5';

    ctx.fillStyle = armorTint;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.8, 0, Math.PI * 2);
    ctx.fill();

    if (hasShield) {
      ctx.fillStyle = '#2060b0';
      ctx.beginPath();
      ctx.moveTo(x - s * 0.9, y - s * 0.7);
      ctx.lineTo(x - s * 0.2, y - s * 0.2);
      ctx.lineTo(x - s * 0.35, y + s * 0.8);
      ctx.lineTo(x - s * 0.9, y + s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#c8a843';
      ctx.beginPath();
      ctx.arc(x - s * 0.58, y + s * 0.05, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#9a7a40';
    ctx.fillStyle = '#d0d0d8';
    ctx.lineWidth = 1.6;

    if (weaponId.includes('bow')) {
      ctx.beginPath();
      ctx.arc(x + s * 0.55, y - s * 0.05, s * 0.72, -Math.PI * 0.68, Math.PI * 0.68);
      ctx.stroke();
      ctx.strokeStyle = '#e0d0a0';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.35, y - s * 0.65);
      ctx.lineTo(x + s * 0.35, y + s * 0.55);
      ctx.stroke();
    } else if (weaponId.includes('crossbow')) {
      ctx.strokeStyle = '#9a7a40';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 1, y - s * 0.2);
      ctx.lineTo(x + s * 0.9, y - s * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + s * 0.48, y - s * 0.2, s * 0.58, Math.PI * 0.12, Math.PI * 0.88, true);
      ctx.stroke();
    } else if (weaponId === 'club' || weaponId === 'war_hammer' || weaponId === 'war_axe') {
      ctx.beginPath();
      ctx.moveTo(x + s * 0.2, y + s * 0.2);
      ctx.lineTo(x + s * 0.85, y - s * 0.95);
      ctx.stroke();
      ctx.fillStyle = weaponId === 'war_axe' ? '#b8b8bf' : '#6a4a28';
      ctx.fillRect(x + s * 0.62, y - s * 1.12, s * 0.32, s * 0.24);
    } else {
      ctx.beginPath();
      ctx.moveTo(x + s * 0.2, y + s * 0.2);
      ctx.lineTo(x + s * 0.65, y - s * 1.3);
      ctx.stroke();
      ctx.fillStyle = '#d0d0d8';
      ctx.beginPath();
      ctx.moveTo(x + s * 0.65, y - s * 1.3);
      ctx.lineTo(x + s * 0.52, y - s * 0.9);
      ctx.lineTo(x + s * 0.78, y - s * 0.9);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawRangedUnit(u) {
    const ctx = this.ctx;
    const { x, y } = this._projectWorld(u.x, u.y);
    const { size: s } = u;

    // Body
    ctx.fillStyle = '#1880a0';
    ctx.beginPath(); ctx.arc(x, y, s * 0.78, 0, Math.PI * 2); ctx.fill();

    // Cloak
    ctx.fillStyle = '#0a5a70';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.8, y);
    ctx.lineTo(x, y + s * 1.2);
    ctx.lineTo(x + s * 0.8, y);
    ctx.closePath(); ctx.fill();

    // Bow
    ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + s * 0.35, y, s * 0.68, -Math.PI * 0.68, Math.PI * 0.68); ctx.stroke();

    // Bowstring
    const a1 = -Math.PI * 0.68, a2 = Math.PI * 0.68;
    ctx.strokeStyle = '#e0d0a0'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.35 + s * 0.68 * Math.cos(a1), y + s * 0.68 * Math.sin(a1));
    ctx.lineTo(x + s * 0.35 + s * 0.68 * Math.cos(a2), y + s * 0.68 * Math.sin(a2));
    ctx.stroke();

    ctx.strokeStyle = '#084858'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, s * 0.78, 0, Math.PI * 2); ctx.stroke();
  }

  _drawCavalry(u) {
    const ctx = this.ctx;
    const { x, y } = this._projectWorld(u.x, u.y);
    const { size: s } = u;

    // Horse body
    ctx.fillStyle = '#a07030';
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.28, s, s * 0.58, 0, 0, Math.PI * 2); ctx.fill();

    // Legs
    ctx.strokeStyle = '#7a5020'; ctx.lineWidth = 2.5;
    const legOff = [[-s * 0.5, s * 0.85], [-s * 0.2, s * 0.95], [s * 0.2, s * 0.95], [s * 0.5, s * 0.85]];
    for (const [lx, ly] of legOff) {
      ctx.beginPath();
      ctx.moveTo(x + lx, y + s * 0.28);
      ctx.lineTo(x + lx, y + ly);
      ctx.stroke();
    }

    // Horse head/neck
    ctx.fillStyle = '#b07838';
    ctx.beginPath(); ctx.ellipse(x + s * 0.75, y - s * 0.08, s * 0.5, s * 0.38, 0.4, 0, Math.PI * 2); ctx.fill();

    // Rider
    ctx.fillStyle = '#e8a020';
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.4, s * 0.38, s * 0.52, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a06010';
    ctx.beginPath(); ctx.arc(x, y - s * 0.8, s * 0.28, 0, Math.PI * 2); ctx.fill();

    // Lance
    ctx.strokeStyle = '#8B5E3C'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + s * 0.18, y - s * 0.4); ctx.lineTo(x + s * 1.9, y - s * 1.05); ctx.stroke();
    ctx.fillStyle = '#c8c8d8';
    ctx.beginPath();
    ctx.moveTo(x + s * 1.9, y - s * 1.05);
    ctx.lineTo(x + s * 1.55, y - s * 0.72);
    ctx.lineTo(x + s * 1.65, y - s * 1.2);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = '#6a4010'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.28, s, s * 0.58, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // ── Health bars ───────────────────────────────────────────────────────────

  _drawHealthBars() {
    const ctx = this.ctx;

    const drawBar = (x, y, w, hp, maxHp) => {
      const ratio = hp / maxHp;
      ctx.fillStyle = 'rgba(12,6,2,0.75)';
      ctx.fillRect(x - w / 2 - 1, y - 4.5, w + 2, 5.5);
      const col = ratio > 0.55 ? '#4ea830' : ratio > 0.28 ? '#c87820' : '#b82818';
      ctx.fillStyle = col;
      ctx.fillRect(x - w / 2, y - 4, w * ratio, 4);
      ctx.strokeStyle = 'rgba(200,160,80,0.45)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x - w / 2 - 1, y - 4.5, w + 2, 5.5);
    };

    for (const e of state.enemies) {
      if (e.state === 'dead') continue;
      const pos = this._projectWorld(e.x, e.y);
      drawBar(pos.x, pos.y - e.size - 4, e.size * 2.2, e.hp, e.maxHp);
    }
    for (const u of state.units) {
      if (u.state === 'dead') continue;
      const pos = this._projectWorld(u.x, u.y);
      drawBar(pos.x, pos.y - u.size - 5, u.size * 2.2, u.hp, u.maxHp);
    }
  }

  // ── Selection highlight ───────────────────────────────────────────────────

  _drawSelection() {
    const { ctx, map } = this;
    const sel = state.selected;
    if (!sel) return;

    if (sel.type === 'building') {
      const b = sel.ref;
      this._withWorldTransform(() => {
        ctx.strokeStyle = '#d4a843';
        ctx.lineWidth   = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(b.px - 3, b.py - 3, b.w + 6, b.h + 6);
        ctx.setLineDash([]);
      });
    } else if (sel.type === 'tile') {
      const px = sel.tx * map.tileSize;
      const py = sel.ty * map.tileSize;
      this._withWorldTransform(() => {
        ctx.strokeStyle = 'rgba(200,160,80,0.55)';
        ctx.lineWidth   = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(px + 0.5, py + 0.5, map.tileSize - 1, map.tileSize - 1);
        ctx.setLineDash([]);
      });
    }
  }

  // ── Tower range circle on selection ──────────────────────────────────────

  _drawRangeCircle() {
    const { ctx, map } = this;
    const sel = state.selected;
    if (!sel || sel.type !== 'building') return;
    const b = sel.ref;
    if (b.defId !== 'tower') return;

    const stats   = decodeTower(b, TOWER_DEFINITION, TECH_TREE);
    const rangePx = stats.range * map.tileSize;
    const cx = b.px + b.w / 2;
    const cy = b.py + b.h / 2;

    this._withWorldTransform(() => {
      ctx.beginPath();
      ctx.arc(cx, cy, rangePx, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200,168,67,0.55)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,168,67,0.06)';
      ctx.fill();
    });
  }
}
