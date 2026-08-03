import { coordToCellId, cellIdToCoord, getNeighbors, GRID_SIZE } from './utils.js';

// Classic Battleship AI: fires randomly ("hunt") until it lands a hit,
// then queues up the four neighboring cells and works along the line
// of the hit ship ("target") until it's sunk.
export class BotAI {
  constructor(gridSize = GRID_SIZE) {
    this.gridSize = gridSize;
    this.availableShots = new Set(Array.from({ length: gridSize * gridSize }, (_, i) => i + 1));
    this.mode = 'hunt';
    this.targetQueue = [];
    this.hitCells = [];
  }

  getRandomShot() {
    const shots = Array.from(this.availableShots);
    if (!shots.length) return null;
    return shots[Math.floor(Math.random() * shots.length)];
  }

  addTarget(row, col) {
    const cellId = coordToCellId(row, col);
    if (this.availableShots.has(cellId) && !this.targetQueue.includes(cellId)) {
      this.targetQueue.push(cellId);
    }
  }

  nextShot() {
    // A queued neighbour can be picked off by a random hunt shot before
    // the queue reaches it. Drop any stale entries, otherwise the bot
    // burns a turn re-firing at a cell it already hit.
    while (this.targetQueue.length > 0 && !this.availableShots.has(this.targetQueue[0])) {
      this.targetQueue.shift();
    }

    if (this.mode === 'target' && this.targetQueue.length > 0) {
      return this.targetQueue.shift();
    }
    this.mode = 'hunt';
    return this.getRandomShot();
  }

  recordResult(cellId, wasHit, sunk) {
    this.availableShots.delete(Number(cellId));
    if (!wasHit) return;

    const { row, col } = cellIdToCoord(cellId);
    this.hitCells.push({ row, col });

    if (sunk) {
      this.mode = 'hunt';
      this.hitCells = [];
      this.targetQueue = [];
      return;
    }

    if (this.mode === 'hunt') {
      this.mode = 'target';
      getNeighbors(row, col, this.gridSize).forEach(({ row: r, col: c }) => this.addTarget(r, c));
      return;
    }

    // Already tracking a line: try to continue in the same direction
    // as the first hit before falling back to neighbor probing.
    const primaryHit = this.hitCells[0];
    const dx = row - primaryHit.row;
    const dy = col - primaryHit.col;

    if (Math.abs(dx) + Math.abs(dy) === 1) {
      const nextRow = row + dx;
      const nextCol = col + dy;
      if (nextRow >= 0 && nextRow < this.gridSize && nextCol >= 0 && nextCol < this.gridSize) {
        this.addTarget(nextRow, nextCol);
      }
      const backRow = primaryHit.row - dx;
      const backCol = primaryHit.col - dy;
      if (backRow >= 0 && backRow < this.gridSize && backCol >= 0 && backCol < this.gridSize) {
        this.addTarget(backRow, backCol);
      }
    }

    if (this.targetQueue.length === 0) {
      getNeighbors(row, col, this.gridSize).forEach(({ row: r, col: c }) => this.addTarget(r, c));
    }
  }
}
