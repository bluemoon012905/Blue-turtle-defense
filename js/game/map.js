// Grid map — tile types, placement validation, walkability grid

export const TILE = {
  EMPTY:    0,
  OCCUPIED: 1,
  BLOCKED:  2,  // impassable terrain (none in v1, reserved)
};

export class GameMap {
  constructor(cols, rows, tileSize, options = {}) {
    this.cols     = cols;
    this.rows     = rows;
    this.tileSize = tileSize;
    this.width    = cols * tileSize;
    this.height   = rows * tileSize;
    this.spawnZoneTiles = Math.max(0, Math.min(
      Math.floor(options.spawnZoneTiles ?? 0),
      Math.floor(Math.min(cols, rows) / 2) - 1,
    ));

    // 2D grid of TILE values
    this.grid = Array.from({ length: rows }, () => new Array(cols).fill(TILE.EMPTY));

    // walkability grid for pathfinding (true = walkable)
    // updated whenever a building is placed/removed
    this.walkable = Array.from({ length: rows }, () => new Array(cols).fill(true));

    this._configureProjection();
  }

  _configureProjection() {
    const tileWidth = this.tileSize * 1.5;
    const tileHeight = this.tileSize * 0.75;
    const worldScaleX = tileWidth / (2 * this.tileSize);
    const worldScaleY = tileHeight / (2 * this.tileSize);
    const paddingX = 56;
    const paddingTop = 88;
    const paddingBottom = 148;
    const groundWidth = (this.width + this.height) * worldScaleX;
    const groundHeight = (this.width + this.height) * worldScaleY;

    this.projection = {
      tileWidth,
      tileHeight,
      worldScaleX,
      worldScaleY,
      paddingX,
      paddingTop,
      paddingBottom,
      originX: paddingX + this.height * worldScaleX,
      originY: paddingTop,
      groundWidth,
      groundHeight,
    };

    this.projectedWidth = Math.ceil(groundWidth + paddingX * 2);
    this.projectedHeight = Math.ceil(groundHeight + paddingTop + paddingBottom);
  }

  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows;
  }

  // Check if a size×size footprint at (tx,ty) is fully empty and in-bounds
  canPlace(tx, ty, size) {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const cx = tx + dx, cy = ty + dy;
        if (!this.inBounds(cx, cy)) return false;
        if (this.grid[cy][cx] !== TILE.EMPTY) return false;
      }
    }
    return true;
  }

  markOccupied(tx, ty, size) {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const cx = tx + dx, cy = ty + dy;
        this.grid[cy][cx]     = TILE.OCCUPIED;
        this.walkable[cy][cx] = false;
      }
    }
  }

  markEmpty(tx, ty, size) {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const cx = tx + dx, cy = ty + dy;
        this.grid[cy][cx]     = TILE.EMPTY;
        this.walkable[cy][cx] = true;
      }
    }
  }

  // Pixel → tile
  pixelToTile(px, py) {
    return {
      tx: Math.floor(px / this.tileSize),
      ty: Math.floor(py / this.tileSize),
    };
  }

  // Tile center → pixel
  tileCenterPx(tx, ty) {
    return {
      x: tx * this.tileSize + this.tileSize / 2,
      y: ty * this.tileSize + this.tileSize / 2,
    };
  }

  worldToScreen(px, py) {
    const { originX, originY, worldScaleX, worldScaleY } = this.projection;
    return {
      x: originX + (px - py) * worldScaleX,
      y: originY + (px + py) * worldScaleY,
    };
  }

  screenToWorld(sx, sy) {
    const { originX, originY, worldScaleX, worldScaleY } = this.projection;
    const dx = sx - originX;
    const dy = sy - originY;

    return {
      x: (dy / worldScaleY + dx / worldScaleX) / 2,
      y: (dy / worldScaleY - dx / worldScaleX) / 2,
    };
  }

  tileToScreen(tx, ty) {
    return this.worldToScreen(tx * this.tileSize, ty * this.tileSize);
  }

  isInSpawnZoneTile(tx, ty) {
    if (!this.inBounds(tx, ty) || this.spawnZoneTiles <= 0) return false;
    return tx < this.spawnZoneTiles
      || ty < this.spawnZoneTiles
      || tx >= this.cols - this.spawnZoneTiles
      || ty >= this.rows - this.spawnZoneTiles;
  }

  isInSpawnZoneWorld(px, py) {
    const { tx, ty } = this.pixelToTile(px, py);
    return this.isInSpawnZoneTile(tx, ty);
  }

  getRandomSpawnPoint() {
    if (this.spawnZoneTiles <= 0) {
      return {
        x: this.tileSize / 2,
        y: this.tileSize / 2,
      };
    }

    for (let i = 0; i < 64; i++) {
      const tx = Math.floor(Math.random() * this.cols);
      const ty = Math.floor(Math.random() * this.rows);
      if (!this.isInSpawnZoneTile(tx, ty)) continue;
      if (!this.walkable[ty]?.[tx]) continue;

      return {
        x: tx * this.tileSize + this.tileSize * (0.2 + Math.random() * 0.6),
        y: ty * this.tileSize + this.tileSize * (0.2 + Math.random() * 0.6),
      };
    }

    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        if (this.isInSpawnZoneTile(tx, ty) && this.walkable[ty][tx]) {
          return this.tileCenterPx(tx, ty);
        }
      }
    }

    return {
      x: this.tileSize / 2,
      y: this.tileSize / 2,
    };
  }

  // Return all 4-connected neighbours that are walkable
  neighbours(tx, ty) {
    const result = [];
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx, dy] of dirs) {
      const nx = tx + dx, ny = ty + dy;
      if (this.inBounds(nx, ny) && this.walkable[ny][nx]) {
        result.push([nx, ny]);
      }
    }
    return result;
  }

  // Also include 8-directional neighbours (for smoother enemy movement)
  neighbours8(tx, ty) {
    const result = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = tx + dx, ny = ty + dy;
        if (this.inBounds(nx, ny) && this.walkable[ny][nx]) {
          result.push([nx, ny]);
        }
      }
    }
    return result;
  }
}
