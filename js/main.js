import { dom } from './dom.js';
import { state } from './state.js';
import { generateGridCells, generateGridCoords } from './board.js';
import { toggleAudioMuted } from './audio.js';
import { openOptions, closeOptions, fillOnlinePlayers, fillPlayerHistory, showBattleScreen, showLobbyScreen } from './ui.js';
import { setPowerUpsEnabled } from './powerups.js';
import { socket } from './network.js';
import { applyMatchConfig, matchConfig } from './matchConfig.js';
import { wireFleetSetupControls, enterFleetSetup } from './placement.js';
import {
  handleSignIn,
  handleSignUp,
  handlePasswordReset,
  togglePasswordVisibility,
  updateCapsLockWarning,
  logout,
  watchAuthState,
  restoreRememberPreference,
} from './auth.js';
import {
  startSoloMode,
  handleForfeit,
  handleBoardPointerMove,
  handleBoardClick,
  handleBoardTouchStart,
  handleBoardTouchMove,
  handleSpacebar,
  handleFireButton,
  handleOpponentFire,
  handleMatchFound,
  handleShotResult,
  handleBattleForfeit,
  handleWaitingForOpponent,
  handleOpponentLeft,
} from './battle.js';

// --- initial render -----------------------------------------------------

// Draw the boards at whatever size the current match config asks for.
function rebuildBoards() {
  generateGridCells(dom.enemyGrid);
  generateGridCells(dom.myGrid);
  generateGridCoords(dom.enemyColLabels, dom.enemyRowLabels);
  generateGridCoords(dom.myColLabels, dom.myRowLabels);
}

restoreRememberPreference();
watchAuthState();

applyMatchConfig();
rebuildBoards();
wireFleetSetupControls();

// --- login screen ---------------------------------------------------------

dom.signInButton.addEventListener('click', handleSignIn);
dom.signUpButton.addEventListener('click', handleSignUp);
dom.forgotPasswordButton?.addEventListener('click', handlePasswordReset);
dom.togglePasswordButton?.addEventListener('click', togglePasswordVisibility);

dom.emailInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') handleSignIn();
});

dom.passwordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') handleSignIn();
  updateCapsLockWarning(event);
});
dom.passwordInput.addEventListener('keyup', updateCapsLockWarning);
dom.passwordInput.addEventListener('focus', updateCapsLockWarning);
dom.passwordInput.addEventListener('blur', () => {
  if (dom.capsLockWarning) dom.capsLockWarning.hidden = true;
});

// --- lobby screen -----------------------------------------------------------

// "Combate Solo" now opens the room setup instead of launching straight
// into a match, so the rules are chosen up front.
dom.startSoloButton?.addEventListener('click', () => dom.roomPanel?.classList.remove('hidden'));
dom.closeRoomButton?.addEventListener('click', () => dom.roomPanel?.classList.add('hidden'));

// Each option group behaves like a radio set.
document.querySelectorAll('.room-options').forEach((group) => {
  group.addEventListener('click', (event) => {
    const btn = event.target.closest('.room-option');
    if (!btn) return;
    group.querySelectorAll('.room-option').forEach((b) => b.classList.remove('room-option-on'));
    btn.classList.add('room-option-on');
    applyMatchConfig({ [group.dataset.key]: btn.dataset.value });
    rebuildBoards();
  });
});

dom.startMatchButton?.addEventListener('click', () => {
  applyMatchConfig({
    powerUps: Boolean(dom.roomPowerUps?.checked),
    music: Boolean(dom.roomMusic?.checked),
  });
  setPowerUpsEnabled(matchConfig.powerUps);
  rebuildBoards();
  dom.roomPanel?.classList.add('hidden');
  startSoloMode();
});
dom.logoutButton?.addEventListener('click', logout);
dom.toggleAudioButton?.addEventListener('click', toggleAudioMuted);
dom.optionsButton?.addEventListener('click', openOptions);
dom.closeOptionsButton?.addEventListener('click', closeOptions);
dom.powerUpToggle?.addEventListener('change', (event) => setPowerUpsEnabled(event.target.checked));
dom.viewHistoryButton?.addEventListener('click', () => fillPlayerHistory());

dom.fleetConfigButton?.addEventListener('click', () => {
  enterFleetSetup();
  showBattleScreen('setup');
});

// --- battle screen ------------------------------------------------------------

dom.forfeitButton?.addEventListener('click', handleForfeit);
dom.backToLobbyButton?.addEventListener('click', () => showLobbyScreen());

if (dom.enemyGrid) {
  dom.enemyGrid.addEventListener('mousemove', handleBoardPointerMove);
  dom.enemyGrid.addEventListener('click', handleBoardClick);
  dom.enemyGrid.addEventListener('touchstart', handleBoardTouchStart, { passive: false });
  dom.enemyGrid.addEventListener('touchmove', handleBoardTouchMove, { passive: false });
}

dom.fireButton?.addEventListener('click', handleFireButton);
document.addEventListener('keydown', handleSpacebar);

// --- multiplayer events ---------------------------------------------------------

socket.on('opponent_fire', handleOpponentFire);
socket.on('match_found', handleMatchFound);
socket.on('shot_result', handleShotResult);
socket.on('battle_forfeit', handleBattleForfeit);
socket.on('waiting_for_opponent', handleWaitingForOpponent);
socket.on('online_players', fillOnlinePlayers);
socket.on('opponent_left', handleOpponentLeft);

// expose minimal debug handle in dev tools without polluting the module scope
if (typeof window !== 'undefined') {
  window.__battleAtSea = { state };
}
