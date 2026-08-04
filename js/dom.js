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
  loginVideo: byId('login-video'),
  toggleAudioButton: byId('toggle-audio-button'),
  logoutButton: byId('logout-button'),
  optionsButton: byId('options-button'),
  closeOptionsButton: byId('close-options-button'),
  optionsPanel: byId('options-panel'),
  playerList: byId('player-list'),
  historyList: byId('history-list'),
  playerName: byId('player-name'),
  appVersion: byId('app-version'),
  patentIcon: byId('patent-icon'),
  patentName: byId('patent-name'),
  patentProgress: byId('patent-progress'),
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
  fleetRoster: byId('fleet-roster'),
  movePad: byId('move-pad'),
  rotateShipButton: byId('rotate-ship'),
  flipShipButton: byId('flip-ship'),
  clearGridButton: byId('clear-grid'),
  randomizeGridButton: byId('randomize-grid'),
  saveFleetButton: byId('save-fleet'),
  setupBackButton: byId('setup-back'),
  setupControls: byId('setup-controls'),

  // periscope / cannon HUD (visible only in targeting mode)
  periscopeReticle: byId('periscope-reticle'),
  cannon: byId('rustic-cannon'),
  turnClock: byId('turn-clock'),
  turnClockValue: byId('turn-clock-value'),
  enemyFleetStatus: byId('enemy-fleet-status'),

  // room creation
  roomPanel: byId('room-panel'),
  closeRoomButton: byId('close-room-button'),
  startMatchButton: byId('start-match-button'),
  findMatchButton: byId('find-match-button'),
  cancelMatchButton: byId('cancel-match-button'),
  matchmakingStatus: byId('matchmaking-status'),
  roomFleetStatus: byId('room-fleet-status'),
  roomConfigureFleet: byId('room-configure-fleet'),

  // profile name (chosen once)
  namePanel: byId('name-panel'),
  profileNameInput: byId('profile-name-input'),
  profileNameError: byId('profile-name-error'),
  confirmNameButton: byId('confirm-name-button'),

  // end of match
  challengePanel: byId('challenge-panel'),
  challengeText: byId('challenge-text'),
  challengeAccept: byId('challenge-accept'),
  challengeDecline: byId('challenge-decline'),

  resultPanel: byId('result-panel'),
  resultTitle: byId('result-title'),
  resultMessage: byId('result-message'),
  resultAgain: byId('result-again'),
  resultLobby: byId('result-lobby'),
  roomPowerUps: byId('room-powerups'),
  roomMusic: byId('room-music'),
  battleStatus: byId('battle-status'),
  targetBadge: byId('target-badge'),
  turnIndicator: byId('turn-indicator'),
  muzzleFlash: byId('muzzle-flash'),
  fireButton: byId('fire-button'),
};

// Directional nudge buttons carry their delta in data attributes.
dom.moveButtons = dom.movePad ? Array.from(dom.movePad.querySelectorAll('.move-btn[data-dr]')) : [];
