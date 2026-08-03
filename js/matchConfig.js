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

export const matchConfig = {
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

export function chainsOnHit() {
  return matchConfig.turnRule === 'encadeado';
}

// Applies the chosen map immediately so the grids rebuild at the right
// dimension before a match begins.
export function applyMatchConfig(partial = {}) {
  Object.assign(matchConfig, partial);
  setGridSize(getMapSize());
  return matchConfig;
}
