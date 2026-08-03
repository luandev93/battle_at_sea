import { dom } from './dom.js';
import { state } from './state.js';
import { generateBoardCells } from './board.js';
import { resetAmmoDisplay } from './ammo.js';
import { toggleAudioMuted } from './audio.js';
import { openOptions, closeOptions, fillOnlinePlayers, fillPlayerHistory } from './ui.js';
import { setPowerUpsEnabled } from './powerups.js';
import { socket } from './network.js';
import { wireFleetModalControls } from './placement.js';
import {
  handleSignIn,
  handleSignUp,
  handlePasswordReset,
  togglePasswordVisibility,
  updateCapsLockWarning,
  logout,
} from './auth.js';
import {
  startSoloMode,
  handleForfeit,
  handleBoardPointerMove,
  handleBoardClick,
  handleBoardTouchStart,
  handleBoardTouchMove,
  handleSpacebar,
  handleOpponentFire,
  handleMatchFound,
  handleShotResult,
  handleBattleForfeit,
  handleWaitingForOpponent,
  handleOpponentLeft,
} from './battle.js';

// --- initial render -----------------------------------------------------

generateBoardCells();
resetAmmoDisplay();
wireFleetModalControls();

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

dom.startSoloButton?.addEventListener('click', startSoloMode);
dom.logoutButton?.addEventListener('click', logout);
dom.toggleAudioButton?.addEventListener('click', toggleAudioMuted);
dom.optionsButton?.addEventListener('click', openOptions);
dom.closeOptionsButton?.addEventListener('click', closeOptions);
dom.powerUpToggle?.addEventListener('change', (event) => setPowerUpsEnabled(event.target.checked));
dom.viewHistoryButton?.addEventListener('click', () => fillPlayerHistory());

// --- battle screen ------------------------------------------------------------

dom.forfeitButton?.addEventListener('click', handleForfeit);

if (dom.board) {
  dom.board.addEventListener('mousemove', handleBoardPointerMove);
  dom.board.addEventListener('click', handleBoardClick);
  dom.board.addEventListener('touchstart', handleBoardTouchStart, { passive: false });
  dom.board.addEventListener('touchmove', handleBoardTouchMove, { passive: false });
}

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
