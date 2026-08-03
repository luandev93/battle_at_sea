import { cellIdToCoord, clamp, GRID_SIZE } from './utils.js';
import { getBlueprint } from './fleetBlueprints.js';

// Returns how many rows/cols a pattern spans, used to size the mini
// silhouette grid shown in the ship inventory.
export function getPatternBounds(pattern) {
  const rows = Math.max(...pattern.map((c) => c.row)) + 1;
  const cols = Math.max(...pattern.map((c) => c.col)) + 1;
  return { rows, cols };
}

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

// Same as coordsForPlacement, but instead of rejecting a drop whose
// shape would overflow the board, it slides the whole ship back inside.
// Ships are anchored by their top-left origin, so without this a drop
// anywhere near the right/bottom edge just silently fails — the aircraft
// carrier, for example, only accepts 42% of cells as a raw anchor. On a
// touch screen that reads as "the game ignored me", so placement drags
// use this forgiving version while random generation keeps the strict one.
export function coordsForPlacementClamped(startCellId, ship, orientation, dir) {
  const blueprint = getBlueprint(ship.type);
  if (!blueprint) return null;

  const base = rotateAndFlipPattern(blueprint.pattern, orientation, dir);
  const { row, col } = cellIdToCoord(startCellId);

  const maxRow = Math.max(...base.map((c) => c.row));
  const maxCol = Math.max(...base.map((c) => c.col));

  const anchorRow = clamp(row, 0, GRID_SIZE - 1 - maxRow);
  const anchorCol = clamp(col, 0, GRID_SIZE - 1 - maxCol);

  return base.map((cell) => ({ row: anchorRow + cell.row, col: anchorCol + cell.col }));
}
