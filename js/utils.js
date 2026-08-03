// Pure helper functions for grid coordinates and generic math.
// No DOM access and no game state here on purpose, so these stay
// trivial to unit test in isolation.

export const GRID_SIZE = 10;

export function coordToCellId(row, col) {
  return row * GRID_SIZE + col + 1;
}

export function cellIdToCoord(cellId) {
  const index = Number(cellId) - 1;
  return {
    row: Math.floor(index / GRID_SIZE),
    col: index % GRID_SIZE,
  };
}

export function getNeighbors(row, col, gridSize = GRID_SIZE) {
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ].filter((coord) => coord.row >= 0 && coord.row < gridSize && coord.col >= 0 && coord.col < gridSize);
}

export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
