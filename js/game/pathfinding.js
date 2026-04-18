// A* pathfinding on the tile grid

function heuristic(ax, ay, bx, by) {
  // Octile distance (good for 8-directional movement)
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/**
 * Find a path from (startTx,startTy) to (goalTx,goalTy) on the given map.
 * Returns an array of pixel-centre waypoints, or null if no path found.
 */
export function findPath(map, startTx, startTy, goalTx, goalTy) {
  const { cols, rows, tileSize, walkable } = map;

  // Goal might be occupied (e.g. the fortress).  Allow reaching it anyway.
  const idx = (tx, ty) => ty * cols + tx;

  const openSet  = new Set();
  const gScore   = new Map();
  const fScore   = new Map();
  const cameFrom = new Map();

  const start = idx(startTx, startTy);
  const goal  = idx(goalTx,  goalTy);

  gScore.set(start, 0);
  fScore.set(start, heuristic(startTx, startTy, goalTx, goalTy));
  openSet.add(start);

  // Simple priority queue via sorted array (fine for our map sizes)
  while (openSet.size > 0) {
    // Pick node with lowest fScore
    let current = null, bestF = Infinity;
    for (const n of openSet) {
      const f = fScore.get(n) ?? Infinity;
      if (f < bestF) { bestF = f; current = n; }
    }

    if (current === goal) {
      // Reconstruct
      const path = [];
      let c = current;
      while (cameFrom.has(c)) {
        const tx = c % cols;
        const ty = Math.floor(c / cols);
        path.unshift({
          x: tx * tileSize + tileSize / 2,
          y: ty * tileSize + tileSize / 2,
        });
        c = cameFrom.get(c);
      }
      // Add start centre
      path.unshift({
        x: startTx * tileSize + tileSize / 2,
        y: startTy * tileSize + tileSize / 2,
      });
      return path;
    }

    openSet.delete(current);
    const cx = current % cols;
    const cy = Math.floor(current / cols);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        // Allow walking onto the goal even if occupied
        if (!walkable[ny][nx] && idx(nx, ny) !== goal) continue;

        const moveCost = (dx !== 0 && dy !== 0) ? Math.SQRT2 : 1;
        const neighbour = idx(nx, ny);
        const tentativeG = (gScore.get(current) ?? Infinity) + moveCost;

        if (tentativeG < (gScore.get(neighbour) ?? Infinity)) {
          cameFrom.set(neighbour, current);
          gScore.set(neighbour, tentativeG);
          fScore.set(neighbour, tentativeG + heuristic(nx, ny, goalTx, goalTy));
          openSet.add(neighbour);
        }
      }
    }
  }

  return null; // no path
}
