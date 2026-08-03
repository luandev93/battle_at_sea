import { coordToCellId, GRID_SIZE } from './utils.js';

const ROW_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'];

// Builds a 10x10 grid of `.board-cell` divs inside `container` instead
// of hard-coding 100 <div> elements per grid in index.html.
export function generateGridCells(container) {
  if (!container) return;
  container.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (let i = 1; i <= GRID_SIZE * GRID_SIZE; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'board-cell';
    cell.dataset.cell = String(i);
    fragment.appendChild(cell);
  }
  container.appendChild(fragment);
}

// Fills in the "A..J" column headers and "1..10" row headers that
// wrap a grid, given the two label container elements.
export function generateGridCoords(columnLabelsEl, rowLabelsEl) {
  if (columnLabelsEl) {
    columnLabelsEl.innerHTML = ROW_LETTERS.slice(0, GRID_SIZE).map((letter) => `<span>${letter}</span>`).join('');
  }
  if (rowLabelsEl) {
    rowLabelsEl.innerHTML = Array.from({ length: GRID_SIZE }, (_, i) => `<span>${i + 1}</span>`).join('');
  }
}

export function getCellElement(container, cellId) {
  return container?.querySelector(`[data-cell="${cellId}"]`) ?? null;
}

export function markSunkShipCells(container, ship) {
  if (!ship || !ship.coords) return;
  ship.coords.forEach(({ row, col }) => {
    getCellElement(container, coordToCellId(row, col))?.classList.add('board-cell-sunk');
  });
}

export function clearGridShots(container) {
  container?.querySelectorAll('.board-cell').forEach((cell) => {
    cell.classList.remove(
      'board-cell-miss',
      'board-cell-hit',
      'board-cell-bot-hit',
      'board-cell-bot-miss',
      'board-cell-fleet-hit',
      'board-cell-sunk',
      'board-cell-fleet'
    );
    delete cell.dataset.shot;
  });
}

export function markPowerUpCell(container, cellId) {
  getCellElement(container, cellId)?.classList.add('board-cell-powerup');
}

export function clearPowerUpMarkers(container) {
  container?.querySelectorAll('.board-cell-powerup').forEach((cell) => {
    cell.classList.remove('board-cell-powerup');
  });
}

// Renders the player's own fleet on the compact "Meu Lado" grid so
// there's a visual reference of ship positions during battle.
export function renderFleetOnGrid(container, fleet) {
  if (!container || !fleet) return;
  fleet.ships.forEach((ship) => {
    ship.coords.forEach(({ row, col }) => {
      getCellElement(container, coordToCellId(row, col))?.classList.add('board-cell-fleet');
    });
  });
}
