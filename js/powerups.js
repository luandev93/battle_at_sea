import { dom } from './dom.js';
import { state } from './state.js';
import { shuffle, coordToCellId } from './utils.js';
import { getWaterCells, fleetCanPlace } from './fleet.js';
import { coordsForPlacement } from './shipGeometry.js';
import { getBlueprint } from './fleetBlueprints.js';
import { markPowerUpCell, clearPowerUpMarkers, getCellElement } from './board.js';
import { setBattleStatus } from './ui.js';
import { resetAmmoDisplay } from './ammo.js';

export const powerUpTypes = ['extra_shot', 'revive_ship', 'reposition_ship'];

const powerUpLabels = {
  extra_shot: 'Tiro Extra',
  revive_ship: 'Reviver Navio',
  reposition_ship: 'Reposicionar Navio',
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

export function setupSoloPowerUps() {
  if (!state.playerFleet || !state.soloEnemyFleet) return;
  clearPowerUpMarkers(dom.enemyGrid);
  clearPowerUpMarkers(dom.myGrid);
  if (!state.powerUpsEnabled) {
    state.playerPowerUps.clear();
    state.enemyPowerUps.clear();
    return;
  }
  state.playerPowerUps = pickPowerUpCells(state.playerFleet, 4);
  state.enemyPowerUps = pickPowerUpCells(state.soloEnemyFleet, 4);
}

function revivePlayerShip() {
  if (!state.playerFleet) return false;
  const damagedShip = state.playerFleet.ships.find((ship) => ship.hits.size > 0);
  if (!damagedShip) return false;

  damagedShip.hits.clear();
  damagedShip.coords.forEach(({ row, col }) => {
    const cell = getCellElement(dom.myGrid, coordToCellId(row, col));
    cell?.classList.remove('board-cell-sunk', 'board-cell-fleet-hit', 'board-cell-bot-hit');
  });
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
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        const cellId = row * 10 + col + 1;
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
      if (state.reloadInterval) {
        clearInterval(state.reloadInterval);
        state.reloadInterval = null;
      }
      resetAmmoDisplay();
      setBattleStatus(`Surpresa! ${powerUpLabels[type]} concedido. Dispare novamente.`);
      return true;

    case 'revive_ship':
      if (revivePlayerShip()) {
        setBattleStatus(`Surpresa! ${powerUpLabels[type]} ativado. Um navio aliado foi restaurado.`);
        return true;
      }
      setBattleStatus(`Surpresa! ${powerUpLabels[type]} encontrado, mas não havia navios para reviver.`);
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
export function maybeActivatePowerUp(cellId, triggeredByPlayer) {
  if (!state.powerUpsEnabled) return null;

  const sourceMap = triggeredByPlayer ? state.enemyPowerUps : state.playerPowerUps;
  if (!sourceMap.has(cellId)) return null;

  const type = sourceMap.get(cellId);
  sourceMap.delete(cellId);
  markPowerUpCell(triggeredByPlayer ? dom.enemyGrid : dom.myGrid, cellId);
  activatePowerUp(type);
  return type;
}
