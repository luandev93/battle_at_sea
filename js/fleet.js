import { coordToCellId, cellIdToCoord, GRID_SIZE } from './utils.js';
import { coordsForPlacement } from './shipGeometry.js';
import { fleetBlueprints, getBlueprint } from './fleetBlueprints.js';

function emptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

// True if every cell a ship would occupy is currently empty.
export function fleetCanPlace(fleet, coords) {
  return coords.every(({ row, col }) => fleet.grid[row][col] === null);
}

export function getWaterCells(fleet) {
  const cells = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (!fleet.grid[row][col]) {
        cells.push(coordToCellId(row, col));
      }
    }
  }
  return cells;
}

// Randomly places every blueprint ship on a fresh grid (used for the
// bot's fleet in solo mode). Largest ships are placed first to reduce
// the chance of running out of room.
export function createFleet() {
  const grid = emptyGrid();
  const ships = [];

  const shipsToPlace = [];
  fleetBlueprints.forEach((blueprint) => {
    const count = blueprint.count || 1;
    for (let i = 0; i < count; i += 1) {
      shipsToPlace.push({ id: `s${shipsToPlace.length}`, type: blueprint.type, coords: [], orientation: 'horizontal', dir: 1 });
    }
  });
  shipsToPlace.sort((a, b) => (getBlueprint(b.type)?.pattern.length || 0) - (getBlueprint(a.type)?.pattern.length || 0));

  shipsToPlace.forEach((ship) => {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 400) {
      attempts += 1;
      const row = Math.floor(Math.random() * GRID_SIZE);
      const col = Math.floor(Math.random() * GRID_SIZE);
      const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
      const dir = Math.random() < 0.5 ? 1 : -1;
      const cellId = coordToCellId(row, col);
      const coords = coordsForPlacement(cellId, ship, orientation, dir);
      if (!coords || coords.some(({ row: r, col: c }) => grid[r][c] !== null)) continue;

      ship.coords = coords;
      ship.orientation = orientation;
      ship.dir = dir;
      ship.size = coords.length;
      ship.hits = new Set();
      coords.forEach(({ row: r, col: c }) => {
        grid[r][c] = ship;
      });
      ships.push(ship);
      placed = true;
    }
  });

  return { grid, ships };
}

export function applyShotToFleet(fleet, cellId) {
  const { row, col } = cellIdToCoord(cellId);
  const ship = fleet.grid[row][col];

  if (!ship) {
    return { hit: false, sunk: false, ship: null };
  }

  ship.hits.add(`${row},${col}`);
  const sunk = ship.hits.size === ship.size;
  return { hit: true, sunk, ship };
}

export function isFleetSunk(fleet) {
  return fleet.ships.every((ship) => ship.hits.size === ship.size);
}

// Converts the fleet-configuration `placement` object (grid of ship
// ids) into the runtime fleet shape used during battle (grid of ship
// object references, with a `hits` Set for damage tracking).
export function buildPlayerFleetFromPlacement(placement) {
  const grid = emptyGrid();
  const ships = [];
  placement.ships.forEach((s) => {
    const shipObj = { size: s.coords.length, type: s.type, coords: s.coords.slice(), hits: new Set() };
    ships.push(shipObj);
    s.coords.forEach(({ row, col }) => {
      grid[row][col] = shipObj;
    });
  });
  return { grid, ships };
}
