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

  // fleet configuration modal
  fleetModal: byId('fleet-modal'),
  fleetInventory: byId('fleet-inventory'),
  fleetGrid: byId('fleet-grid'),
  rotateShipButton: byId('rotate-ship'),
  flipShipButton: byId('flip-ship'),
  clearGridButton: byId('clear-grid'),
  randomizeGridButton: byId('randomize-grid'),
  saveFleetButton: byId('save-fleet'),
  closeFleetButton: byId('close-fleet'),

  // battle screen
  board: byId('board'),
  periscopeReticle: byId('periscope-reticle'),
  cannon: byId('rustic-cannon'),
  ammoCounter: byId('ammo-counter'),
  battleStatus: byId('battle-status'),
  forfeitButton: byId('forfeit-button'),
};

// queried lazily because it's inside ammoCounter, which may be null
dom.ammoValue = dom.ammoCounter?.querySelector('.ammo-value') ?? null;
