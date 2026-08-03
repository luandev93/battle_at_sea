import { dom } from './dom.js';
import { coordToCellId, GRID_SIZE } from './utils.js';

// Builds the 10x10 battle grid at runtime instead of hard-coding 100
// <div> elements in index.html.
export function generateBoardCells() {
  if (!dom.board) return;
  dom.board.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (let i = 1; i <= GRID_SIZE * GRID_SIZE; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'board-cell';
    cell.dataset.cell = String(i);
    fragment.appendChild(cell);
  }
  dom.board.appendChild(fragment);
}

export function getCellElement(cellId) {
  return dom.board?.querySelector(`[data-cell="${cellId}"]`) ?? null;
}

export function markSunkShipCells(ship) {
  if (!ship || !ship.coords) return;
  ship.coords.forEach(({ row, col }) => {
    getCellElement(coordToCellId(row, col))?.classList.add('board-cell-sunk');
  });
}

export function clearBoardShots() {
  dom.board?.querySelectorAll('.board-cell').forEach((cell) => {
    cell.classList.remove(
      'board-cell-miss',
      'board-cell-hit',
      'board-cell-bot-hit',
      'board-cell-bot-miss',
      'board-cell-fleet-hit',
      'board-cell-sunk'
    );
    delete cell.dataset.shot;
  });
}

export function markPowerUpCell(cellId) {
  getCellElement(cellId)?.classList.add('board-cell-powerup');
}

export function clearPowerUpMarkers() {
  dom.board?.querySelectorAll('.board-cell-powerup').forEach((cell) => {
    cell.classList.remove('board-cell-powerup');
  });
}
