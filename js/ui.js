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

export function showBattleScreen() {
  state.currentScreen = 'battle';
  dom.lobbyScreen?.classList.add('hidden');
  dom.lobbyScreen?.classList.remove('visible');
  dom.battleScreen?.classList.remove('hidden');
  dom.battleScreen?.classList.add('visible');
  pauseLobbyAudio();
  startAmbientSound();
}

export function openOptions() {
  dom.optionsPanel?.classList.remove('hidden');
}

export function closeOptions() {
  dom.optionsPanel?.classList.add('hidden');
}
