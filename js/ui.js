import { dom } from './dom.js';
import { state } from './state.js';
import { playLobbyAudio, pauseLobbyAudio, startAmbientSound, stopAmbientSound } from './audio.js';

export function displayError(message) {
  if (dom.errorMessage) {
    dom.errorMessage.textContent = message;
  }
}

export function clearError() {
  if (dom.errorMessage) {
    dom.errorMessage.textContent = '';
  }
}

export function setBattleStatus(message) {
  if (dom.battleStatus) {
    dom.battleStatus.textContent = message;
  }
}

export function setTargetBadge(text) {
  if (dom.targetBadge) {
    dom.targetBadge.textContent = text;
  }
}

export function fillOnlinePlayers(players = []) {
  if (!dom.playerList) return;
  dom.playerList.innerHTML = players.length
    ? players.map((player) => `<li>${player}</li>`).join('')
    : '<li>Aguardando combatentes...</li>';
}

export function fillPlayerHistory(email = 'Jogador') {
  if (!dom.historyList) return;
  const history = [
    `Jogador: ${email}`,
    `Última vitória: 3 dias atrás`,
    `Derrotas: 7`,
    `Vitórias: 12`,
    `Taxa de vitória: 63%`,
  ];
  dom.historyList.innerHTML = history.map((item) => `<li>${item}</li>`).join('');
}

export function showLoginScreen() {
  state.currentScreen = 'login';
  dom.loginScreen?.classList.remove('hidden');
  dom.lobbyScreen?.classList.add('hidden');
  dom.lobbyScreen?.classList.remove('visible');
  dom.battleScreen?.classList.add('hidden');
  dom.battleScreen?.classList.remove('visible');
  pauseLobbyAudio();
  stopAmbientSound();
}

export function showLobbyScreen() {
  state.currentScreen = 'lobby';
  dom.loginScreen?.classList.add('hidden');
  dom.lobbyScreen?.classList.remove('hidden');
  dom.lobbyScreen?.classList.add('visible');
  dom.battleScreen?.classList.add('hidden');
  dom.battleScreen?.classList.remove('visible');
  stopAmbientSound();
  playLobbyAudio();
}

// `mode` is 'setup' | 'waiting' | 'targeting' and drives which parts of
// the tactical board (ship inventory, periscope HUD, lock overlay...)
// are visible, entirely through CSS attribute selectors on #tactical-board.
export function showBattleScreen(mode = 'waiting') {
  state.currentScreen = 'battle';
  state.battleMode = mode;
  dom.loginScreen?.classList.add('hidden');
  dom.lobbyScreen?.classList.add('hidden');
  dom.lobbyScreen?.classList.remove('visible');
  dom.battleScreen?.classList.remove('hidden');
  dom.battleScreen?.classList.add('visible');
  if (dom.tacticalBoard) {
    dom.tacticalBoard.dataset.mode = mode;
  }
  pauseLobbyAudio();
  startAmbientSound();
}

export function setBattleMode(mode) {
  state.battleMode = mode;
  if (dom.tacticalBoard) {
    dom.tacticalBoard.dataset.mode = mode;
  }
}

export function openOptions() {
  dom.optionsPanel?.classList.remove('hidden');
}

export function closeOptions() {
  dom.optionsPanel?.classList.add('hidden');
}
