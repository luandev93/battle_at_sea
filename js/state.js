// Single shared state object. Every module that needs to read or write
// game state imports `state` and mutates its properties directly.
// This keeps the ~15 feature modules from having to pass a dozen
// parameters around, while still making all shared state discoverable
// from one place instead of being scattered across the codebase.

export const state = {
  // networking / turn control
  playerIndex: null,
  isPlayerTurn: false,
  canShoot: true,
  turnClockInterval: null,

  // aiming
  selectedCellId: null, // logical target cell, moved with taps or arrow keys
  lastReticleClientX: null,
  lastReticleClientY: null,

  // solo mode
  isSoloMode: false,
  botAI: null,
  soloEnemyFleet: null,

  // fleets
  playerFleet: null,

  // power-ups
  enemyPowerUps: new Map(),
  playerPowerUps: new Map(),
  extraShotActive: false,
  powerUpsEnabled: true,

  // audio
  audioMuted: false,

  // player / progression
  currentPlayerId: null,

  // fleet placement (configuration modal)
  fleetSaved: false,
  placingOrientation: 'horizontal', // 'horizontal' | 'vertical'
  placingDir: 1, // 1 forward, -1 reverse
  placement: null, // { grid: 14x14 of null|shipId, ships: [...] }
  selectedShipId: null, // ship currently armed in the setup selector
  activeShipId: null,   // ship on the grid that the movement pad controls

  // which screen is currently visible: 'login' | 'lobby' | 'battle'
  currentScreen: 'login',

  // sub-mode within the battle screen: 'setup' | 'waiting' | 'targeting'
  battleMode: 'setup',
};
