import { dom } from './dom.js';
import { state } from './state.js';
import { generateGridCells, generateGridCoords } from './board.js';
import { toggleAudioMuted } from './audio.js';
import { openOptions, closeOptions, fillOnlinePlayers, fillPlayerHistory, showBattleScreen, showLobbyScreen } from './ui.js';
import { setPowerUpsEnabled } from './powerups.js';
import { socket, emitFindMatch, emitCancelMatch } from './network.js';
import { applyMatchConfig, matchConfig } from './matchConfig.js';
import { APP_VERSION } from './version.js';
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
  handleArrowKeys,
  hideMatchResult,
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

if (dom.appVersion) dom.appVersion.textContent = `v${APP_VERSION}`;

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
// Reflects whether a fleet is ready, and blocks starting without one.
function syncRoomFleetState() {
  const ready = Boolean(state.fleetSaved);
  if (dom.roomFleetStatus) {
    dom.roomFleetStatus.textContent = ready ? '✓ Frota pronta para o combate' : 'Frota não configurada';
    dom.roomFleetStatus.classList.toggle('room-fleet-ready', ready);
  }
  if (dom.startMatchButton) {
    dom.startMatchButton.disabled = !ready;
    dom.startMatchButton.textContent = ready ? 'Iniciar Combate' : 'Configure a frota primeiro';
  }
}

function openRoomPanel() {
  syncRoomFleetState();
  dom.roomPanel?.classList.remove('hidden');
}

dom.startSoloButton?.addEventListener('click', () => {
  // Someone who has never set a fleet is sent straight to the shipyard
  // instead of being shown a room they cannot start.
  if (!state.fleetSaved) {
    enterFleetSetup();
    showBattleScreen('setup');
    return;
  }
  openRoomPanel();
});

document.addEventListener('fleet-saved', syncRoomFleetState);

dom.roomConfigureFleet?.addEventListener('click', () => {
  dom.roomPanel?.classList.add('hidden');
  enterFleetSetup();
  showBattleScreen('setup');
});
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

function setSearching(on) {
  dom.findMatchButton?.classList.toggle('hidden', on);
  dom.cancelMatchButton?.classList.toggle('hidden', !on);
  if (dom.startMatchButton) dom.startMatchButton.disabled = on || !state.fleetSaved;
  if (dom.matchmakingStatus) {
    dom.matchmakingStatus.textContent = on ? 'Procurando adversário...' : '';
  }
}

dom.findMatchButton?.addEventListener('click', () => {
  if (!state.fleetSaved) {
    if (dom.matchmakingStatus) dom.matchmakingStatus.textContent = 'Configure sua frota antes de buscar partida.';
    return;
  }
  applyMatchConfig({
    powerUps: Boolean(dom.roomPowerUps?.checked),
    music: Boolean(dom.roomMusic?.checked),
  });
  setPowerUpsEnabled(matchConfig.powerUps);
  setSearching(true);
  emitFindMatch(matchConfig);
});

dom.cancelMatchButton?.addEventListener('click', () => {
  emitCancelMatch();
  setSearching(false);
});

socket.on('match_cancelled', () => setSearching(false));
socket.on('match_found', () => {
  setSearching(false);
  dom.roomPanel?.classList.add('hidden');
});

// The room config can arrive from the opponent, so the grids may need
// to be rebuilt at a different size than the one chosen locally.
document.addEventListener('rebuild-boards', rebuildBoards);

dom.startMatchButton?.addEventListener('click', () => {
  applyMatchConfig({
    powerUps: Boolean(dom.roomPowerUps?.checked),
    music: Boolean(dom.roomMusic?.checked),
  });
  setPowerUpsEnabled(matchConfig.powerUps);
  rebuildBoards();
  dom.roomPanel?.classList.add('hidden');
  hideMatchResult();
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
dom.setupBackButton?.addEventListener('click', () => showLobbyScreen());

// End-of-match actions
dom.resultAgain?.addEventListener('click', () => {
  hideMatchResult();
  startSoloMode();
});
dom.resultLobby?.addEventListener('click', () => {
  hideMatchResult();
  showLobbyScreen();
});
dom.backToLobbyButton?.addEventListener('click', () => showLobbyScreen());

if (dom.enemyGrid) {
  dom.enemyGrid.addEventListener('mousemove', handleBoardPointerMove);
  dom.enemyGrid.addEventListener('click', handleBoardClick);
  dom.enemyGrid.addEventListener('touchstart', handleBoardTouchStart, { passive: false });
  dom.enemyGrid.addEventListener('touchmove', handleBoardTouchMove, { passive: false });
}

dom.fireButton?.addEventListener('click', handleFireButton);
document.addEventListener('keydown', handleSpacebar);
document.addEventListener('keydown', handleArrowKeys);

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
