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

// Classic Battleship spacing: two ships may never touch, not even at a
// corner. Each occupied cell must be free, and all eight surrounding
// cells must be either water or part of the ship being placed itself
// (its own cells are obviously adjacent to each other).
export function canPlaceWithSpacing(grid, coords, selfMarker = null) {
  const own = new Set(coords.map(({ row, col }) => `${row},${col}`));

  return coords.every(({ row, col }) => {
    if (grid[row][col] !== null && grid[row][col] !== selfMarker) return false;

    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
        if (own.has(`${r},${c}`)) continue;
        const occupant = grid[r][c];
        if (occupant !== null && occupant !== selfMarker) return false;
      }
    }
    return true;
  });
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
      if (!coords || !canPlaceWithSpacing(grid, coords)) continue;

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

// Because ships may never touch, every cell surrounding a sunk ship is
// guaranteed to be water. Revealing it automatically saves the player
// from spending turns on shots whose outcome is already known.
export function revealWaterAroundShip(ship) {
  const around = new Set();
  const own = new Set(ship.coords.map(({ row, col }) => `${row},${col}`));

  ship.coords.forEach(({ row, col }) => {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
        if (own.has(`${r},${c}`)) continue;
        around.add(coordToCellId(r, c));
      }
    }
  });
  return [...around];
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
