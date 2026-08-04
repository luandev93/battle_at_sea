import { dom } from './dom.js';
import { state } from './state.js';
import { shuffle, coordToCellId, cellIdToCoord, GRID_SIZE } from './utils.js';
import { getWaterCells, fleetCanPlace, canPlaceWithSpacing } from './fleet.js';
import { coordsForPlacement } from './shipGeometry.js';
import { getBlueprint } from './fleetBlueprints.js';
import { markPowerUpCell, clearPowerUpMarkers, getCellElement } from './board.js';
import { setBattleStatus } from './ui.js';

export const powerUpTypes = ['extra_shot', 'reinforce_ship', 'reposition_ship'];

// Icon stamped on the revealed cell so the board itself says what was
// found, instead of the information living only in a banner that fades.
export const POWERUP_ICONS = {
  extra_shot: '⚡',
  reinforce_ship: '🛡️',
  reposition_ship: '🔄',
  mine: '💣',
};

const powerUpLabels = {
  extra_shot: 'Tiro Extra',
  reinforce_ship: 'Reforço de Casco',
  reposition_ship: 'Reposicionar Navio',
  mine: 'Mina Naval',
};

export function pickPowerUpCells(fleet, count = 4) {
  const waterCells = shuffle(getWaterCells(fleet));
  const selected = new Map();
  for (let i = 0; i < Math.min(count, waterCells.length); i += 1) {
    selected.set(waterCells[i], powerUpTypes[i % powerUpTypes.length]);
  }
  return selected;
}

export function setPowerUpsEnabled(value) {
  state.powerUpsEnabled = Boolean(value);
  if (!state.powerUpsEnabled) {
    state.playerPowerUps.clear();
    state.enemyPowerUps.clear();
    clearPowerUpMarkers(dom.enemyGrid);
    clearPowerUpMarkers(dom.myGrid);
  }
  if (dom.powerUpToggle) {
    dom.powerUpToggle.checked = state.powerUpsEnabled;
  }
}

// A flat count of 4 was tuned for a 10x10 board. On 14x14 that is 2.7%
// of the water — roughly 37 misses before finding one, which is why they
// went unnoticed. Scale with the board so they actually show up.
function powerUpCountForBoard() {
  return Math.max(4, Math.round((GRID_SIZE * GRID_SIZE) / 18));
}

// Mines live in the same water as power-ups but are a separate,
// separately-toggled hazard: hitting one detonates the whole ring around
// it, resolving each neighbouring cell as a real shot.
export function pickMineCells(fleet, count) {
  const water = shuffle(getWaterCells(fleet));
  return new Set(water.slice(0, Math.min(count, water.length)));
}

export function mineCountForBoard() {
  return Math.max(2, Math.round((GRID_SIZE * GRID_SIZE) / 40));
}

export function setMinesEnabled(value) {
  state.minesEnabled = Boolean(value);
  if (!state.minesEnabled) {
    state.playerMines.clear();
    state.enemyMines.clear();
  }
}

export function setupSoloPowerUps() {
  if (!state.playerFleet || !state.soloEnemyFleet) return;
  clearPowerUpMarkers(dom.enemyGrid);
  clearPowerUpMarkers(dom.myGrid);
  if (!state.powerUpsEnabled) {
    state.playerPowerUps.clear();
    state.enemyPowerUps.clear();
    return;
  }
  const count = powerUpCountForBoard();
  state.playerPowerUps = pickPowerUpCells(state.playerFleet, count);
  state.enemyPowerUps = pickPowerUpCells(state.soloEnemyFleet, count);

  if (state.minesEnabled) {
    const mines = mineCountForBoard();
    state.playerMines = pickMineCells(state.playerFleet, mines);
    state.enemyMines = pickMineCells(state.soloEnemyFleet, mines);
  } else {
    state.playerMines = new Set();
    state.enemyMines = new Set();
  }
}

// Stamps the icon of whatever was found onto the revealed cell.
export function stampCellIcon(container, cellId, type) {
  const cell = getCellElement(container, cellId);
  if (!cell) return;
  cell.dataset.event = POWERUP_ICONS[type] || '';
  cell.classList.add('board-cell-event');
}

// Returns the ring of cells a mine detonation should resolve.
export function mineBlastCells(cellId) {
  const { row, col } = cellIdToCoord(cellId);
  const out = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (!dr && !dc) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
      out.push(coordToCellId(r, c));
    }
  }
  return out;
}

export function hasMine(cellId, triggeredByPlayer) {
  if (!state.minesEnabled) return false;
  const map = triggeredByPlayer ? state.enemyMines : state.playerMines;
  if (!map.has(cellId)) return false;
  map.delete(cellId);
  return true;
}

// Replaces the old "revive" bonus. Instead of restoring something that
// was already destroyed, this drops a brand new single-cell hull into
// your own waters, respecting the no-touch spacing rule.
function reinforcePlayerFleet() {
  const fleet = state.playerFleet;
  if (!fleet) return false;

  const candidates = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const coords = [{ row, col }];
      if (canPlaceWithSpacing(fleet.grid, coords)) candidates.push(coords);
    }
  }
  if (!candidates.length) return false;

  const coords = candidates[Math.floor(Math.random() * candidates.length)];
  const ship = {
    id: `reinforce-${Date.now()}`,
    type: 'submarine',
    size: 1,
    coords,
    hits: new Set(),
    color: '#6fe0a0',
  };
  fleet.ships.push(ship);
  coords.forEach(({ row, col }) => {
    fleet.grid[row][col] = ship;
  });

  const cell = getCellElement(dom.myGrid, coordToCellId(coords[0].row, coords[0].col));
  if (cell) {
    cell.classList.add('board-cell-fleet', 'board-cell-reinforced');
    cell.style.setProperty('--ship-color', '#6fe0a0');
  }
  return true;
}

function repositionPlayerShip() {
  const fleet = state.playerFleet;
  if (!fleet) return false;

  const candidates = shuffle([...fleet.ships]).filter((ship) => ship.hits.size < ship.size);
  for (const ship of candidates) {
    const blueprint = getBlueprint(ship.type);
    if (!blueprint) continue;

    ship.coords.forEach(({ row, col }) => {
      fleet.grid[row][col] = null;
    });

    const availableCells = [];
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const cellId = coordToCellId(row, col);
        ['horizontal', 'vertical'].forEach((orientation) => {
          [1, -1].forEach((dir) => {
            const coords = coordsForPlacement(cellId, { type: ship.type }, orientation, dir);
            if (coords && fleetCanPlace(fleet, coords)) {
              availableCells.push(coords);
            }
          });
        });
      }
    }

    if (availableCells.length === 0) {
      ship.coords.forEach(({ row, col }) => {
        fleet.grid[row][col] = ship;
      });
      continue;
    }

    const newCoords = availableCells[Math.floor(Math.random() * availableCells.length)];
    ship.coords = newCoords;
    ship.hits.clear();
    newCoords.forEach(({ row, col }) => {
      fleet.grid[row][col] = ship;
    });

    // refresh the visual: clear old damage marks, redraw the ship in its new spot
    getCellElement(dom.myGrid, coordToCellId(newCoords[0].row, newCoords[0].col));
    return true;
  }
  return false;
}

export function activatePowerUp(type) {
  if (!state.powerUpsEnabled) return false;

  switch (type) {
    case 'extra_shot':
      state.extraShotActive = true;
      state.canShoot = true;
      setBattleStatus(`Surpresa! ${powerUpLabels[type]} concedido. Dispare novamente.`);
      return true;

    case 'reinforce_ship':
      if (reinforcePlayerFleet()) {
        setBattleStatus(`${powerUpLabels[type]}! Um novo casco surgiu na sua frota.`);
        return true;
      }
      setBattleStatus(`${powerUpLabels[type]} encontrado, mas não há espaço livre na sua grade.`);
      return false;

    case 'reposition_ship':
      if (repositionPlayerShip()) {
        setBattleStatus(`Surpresa! ${powerUpLabels[type]} ativado. Um navio aliado foi reposicionado.`);
        return true;
      }
      setBattleStatus(`Surpresa! ${powerUpLabels[type]} encontrado, mas não foi possível reposicionar.`);
      return false;

    default:
      return false;
  }
}

// `triggeredByPlayer` picks which side's power-up map is checked (the
// player reveals power-ups hidden in the *enemy's* water, and vice
// versa) and therefore which grid the reveal is drawn on.
// A status line was too easy to miss; a banner makes the pickup obvious.
function announcePowerUp(type, triggeredByPlayer) {
  const banner = document.getElementById('powerup-banner');
  if (!banner) return;
  const who = triggeredByPlayer ? 'Você encontrou' : 'O adversário revelou';
  banner.innerHTML = `<strong>${powerUpLabels[type]}</strong><span>${who} uma caixa surpresa!</span>`;
  banner.classList.remove('powerup-banner-on');
  void banner.offsetWidth;
  banner.classList.add('powerup-banner-on');
  setTimeout(() => banner.classList.remove('powerup-banner-on'), 2600);
}

export function maybeActivatePowerUp(cellId, triggeredByPlayer) {
  if (!state.powerUpsEnabled) return null;

  const sourceMap = triggeredByPlayer ? state.enemyPowerUps : state.playerPowerUps;
  if (!sourceMap.has(cellId)) return null;

  const type = sourceMap.get(cellId);
  sourceMap.delete(cellId);
  const grid = triggeredByPlayer ? dom.enemyGrid : dom.myGrid;
  markPowerUpCell(grid, cellId);
  stampCellIcon(grid, cellId, type);
  announcePowerUp(type, triggeredByPlayer);
  activatePowerUp(type);
  return type;
}
