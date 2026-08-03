// Every `document.getElementById` call lives here so the rest of the
// codebase never touches the DOM tree directly by id. This module must
// be imported after the document has parsed (the app's entry script
// is loaded as `type="module"` at the end of <body>, which already
// guarantees that).

function byId(id) {
  return document.getElementById(id);
}

export const dom = {
  // login screen
  emailInput: byId('email'),
  passwordInput: byId('password'),
  togglePasswordButton: byId('toggle-password'),
  capsLockWarning: byId('caps-lock-warning'),
  rememberMeCheckbox: byId('remember-me'),
  forgotPasswordButton: byId('forgot-password-button'),
  signInButton: byId('sign-in-button'),
  signUpButton: byId('sign-up-button'),
  errorMessage: byId('error-message'),

  // screens
  loginScreen: byId('login-screen'),
  lobbyScreen: byId('lobby-screen'),
  battleScreen: byId('battle-screen'),

  // lobby
  lobbyVideo: byId('lobby-video'),
  toggleAudioButton: byId('toggle-audio-button'),
  logoutButton: byId('logout-button'),
  optionsButton: byId('options-button'),
  closeOptionsButton: byId('close-options-button'),
  optionsPanel: byId('options-panel'),
  playerList: byId('player-list'),
  historyList: byId('history-list'),
  playerName: byId('player-name'),
  patentIcon: byId('patent-icon'),
  fleetConfigButton: byId('fleet-config-button'),
  fleetConfigStatus: byId('fleet-config-status'),
  viewHistoryButton: byId('view-history-button'),
  startSoloButton: byId('start-solo-button'),
  powerUpToggle: byId('powerup-toggle'),

  // battle screen: tactical board (dual grid, always present)
  tacticalBoard: byId('tactical-board'),
  backToLobbyButton: byId('back-to-lobby-button'),
  forfeitButton: byId('forfeit-button'),

  // enemy grid ("Alvos Inimigos") — primary grid, doubles as the
  // periscope targeting surface once it's the player's turn
  enemyGridWrapper: byId('enemy-grid-wrapper'),
  enemyGrid: byId('enemy-grid'),
  enemyColLabels: byId('enemy-col-labels'),
  enemyRowLabels: byId('enemy-row-labels'),
  setupLockOverlay: byId('setup-lock-overlay'),

  // my grid ("Meu Lado") — compact fleet/damage reference
  myGrid: byId('my-grid'),
  myColLabels: byId('my-col-labels'),
  myRowLabels: byId('my-row-labels'),

  // fleet setup (visible only in setup mode)
  shipSelector: byId('ship-selector'),
  setupMessage: byId('setup-message'),
  rotateShipButton: byId('rotate-ship'),
  flipShipButton: byId('flip-ship'),
  clearGridButton: byId('clear-grid'),
  randomizeGridButton: byId('randomize-grid'),
  saveFleetButton: byId('save-fleet'),
  setupControls: byId('setup-controls'),

  // periscope / cannon HUD (visible only in targeting mode)
  periscopeReticle: byId('periscope-reticle'),
  cannon: byId('rustic-cannon'),
  ammoCounter: byId('ammo-counter'),
  battleStatus: byId('battle-status'),
  targetBadge: byId('target-badge'),
};

// queried lazily because it's inside ammoCounter, which may be null
dom.ammoValue = dom.ammoCounter?.querySelector('.ammo-value') ?? null;
