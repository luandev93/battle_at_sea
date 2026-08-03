import { cellIdToCoord, GRID_SIZE } from './utils.js';
import { getBlueprint } from './fleetBlueprints.js';

// Rotates a pattern 90° (horizontal <-> vertical) and/or mirrors it
// (dir -1), then re-normalizes so the minimum row/col is always 0.
export function rotateAndFlipPattern(pattern, orientation, dir) {
  let coords = pattern.map(({ row, col }) => ({ row, col }));

  if (orientation === 'vertical') {
    coords = coords.map(({ row, col }) => ({ row: col, col: -row }));
  }
  if (dir === -1) {
    coords = coords.map(({ row, col }) => ({ row, col: -col }));
  }

  const minRow = Math.min(...coords.map((c) => c.row));
  const minCol = Math.min(...coords.map((c) => c.col));
  return coords.map(({ row, col }) => ({ row: row - minRow, col: col - minCol }));
}

// Resolves the absolute board coordinates a ship would occupy if its
// pattern's origin were dropped on `startCellId`. Returns null if any
// resulting cell falls off the 10x10 board.
export function coordsForPlacement(startCellId, ship, orientation, dir) {
  const blueprint = getBlueprint(ship.type);
  if (!blueprint) return null;

  const base = rotateAndFlipPattern(blueprint.pattern, orientation, dir);
  const { row, col } = cellIdToCoord(startCellId);
  const coords = base.map((cell) => ({ row: row + cell.row, col: col + cell.col }));

  const outOfBounds = coords.some(
    ({ row: r, col: c }) => r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE
  );
  return outOfBounds ? null : coords;
}
