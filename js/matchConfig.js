import { MAP_PRESETS, setGridSize } from './utils.js';

// Everything that can be agreed before a match starts. The reload
// countdown this replaces punished the player for having fired; a turn
// clock instead bounds how long you may think, like a chess clock, and
// is optional.

export const TURN_RULES = {
  encadeado: {
    label: 'Acertou, atira de novo',
    description: 'O turno continua enquanto você acertar. Ritmo acelerado.',
  },
  alternado: {
    label: 'Um tiro por vez',
    description: 'A vez passa ao adversário após cada disparo.',
  },
};

export const TURN_CLOCKS = {
  livre: { seconds: 0, label: 'Sem limite', description: 'Pense o quanto quiser.' },
  relaxado: { seconds: 60, label: '60s por jogada', description: 'Tempo confortável.' },
  rapido: { seconds: 30, label: '30s por jogada', description: 'Pressão moderada.' },
  blitz: { seconds: 10, label: '10s por jogada', description: 'Decisão instantânea.' },
};

export const FIRE_MODES = {
  toque: { label: 'Toque direto', description: 'Toca na casa e dispara.' },
  botao: { label: 'Mirar e confirmar', description: 'Seleciona a casa e usa o botão FOGO.' },
};

export const matchConfig = {
  fireMode: 'toque',
  map: 'padrao',
  turnRule: 'encadeado',
  turnClock: 'livre',
  powerUps: true,
  music: true,
};

export function getMapSize() {
  return MAP_PRESETS[matchConfig.map]?.size ?? 14;
}

export function getTurnSeconds() {
  return TURN_CLOCKS[matchConfig.turnClock]?.seconds ?? 0;
}

export function firesOnTap() {
  return matchConfig.fireMode === 'toque';
}

export function chainsOnHit() {
  return matchConfig.turnRule === 'encadeado';
}

// Applies the chosen map immediately so the grids rebuild at the right
// dimension before a match begins.
// Returns true when the applied config changed the board dimension. A
// fleet is stored as coordinates for one specific board size, so any
// change invalidates it — that mismatch corrupted both solo and PvP
// matches when the map was switched after saving.
export function applyMatchConfig(partial = {}) {
  const before = getMapSize();
  Object.assign(matchConfig, partial);
  const after = getMapSize();
  setGridSize(after);
  return { config: matchConfig, sizeChanged: before !== after };
}
