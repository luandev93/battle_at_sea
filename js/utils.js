// Pure helper functions for grid coordinates and generic math.
// No DOM access and no game state here on purpose, so these stay
// trivial to unit test in isolation.

// Mutable so the map size can be chosen when a room is created. ES
// module live bindings mean every importer sees the new value without
// needing to re-import, as long as they read it at call time (they do).
export let GRID_SIZE = 14;

export const MAP_PRESETS = {
  // 10x10 and 11x11 are deliberately absent: with the no-touch rule the
  // 13-ship fleet never fits on 10x10 and fits only 16% of the time on
  // 11x11, so offering them would hand the player a broken match.
  compacto: { size: 13, label: 'Compacto', description: '13x13 — partidas curtas' },
  padrao: { size: 14, label: 'Padrão', description: '14x14 — equilíbrio tático' },
  oceano: { size: 16, label: 'Oceano', description: '16x16 — mais espaço para manobra' },
};

export function setGridSize(size) {
  GRID_SIZE = size;
  if (typeof document !== 'undefined') {
    // The CSS grid reads this so the board redraws at the new dimension.
    document.documentElement.style.setProperty('--grid-size', String(size));
  }
}

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
