import { dom } from './dom.js';
import { state } from './state.js';
import { playLoginVideo, pauseLoginVideo, startAmbientSound, stopAmbientSound } from './audio.js';

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

// The server now sends objects with a status, so the lobby can show who
// is actually available instead of a flat list of names.
export function fillOnlinePlayers(players = []) {
  if (!dom.playerList) return;

  if (!players.length) {
    dom.playerList.innerHTML = '<li>Nenhum jogador online.</li>';
    return;
  }

  dom.playerList.innerHTML = players
    .map((p) => {
      const name = typeof p === 'string' ? p : p.name;
      const id = typeof p === 'string' ? null : p.id;
      const status = typeof p === 'string' ? '' : p.status || '';
      const isSelf = id && id === state.socketId;
      const cls =
        status === 'Em combate' ? 'status-busy' : status === 'Procurando partida' ? 'status-searching' : 'status-idle';

      // Only idle opponents can be challenged; yourself never can.
      const canChallenge = id && !isSelf && status === 'No lobby';
      const action = isSelf
        ? '<span class="player-you">você</span>'
        : canChallenge
          ? `<button type="button" class="challenge-button" data-id="${id}" data-name="${name}">Desafiar</button>`
          : `<span class="player-status ${cls}">${status}</span>`;

      return `<li class="player-row"><span class="player-name">${name}</span>${action}</li>`;
    })
    .join('');
}

// Reads the player's actual saved stats. This panel used to show fixed
// invented numbers (12 vitórias, 63%...) to everyone, including accounts
// created seconds earlier.
export function fillPlayerHistory(stats = null) {
  if (!dom.historyList) return;

  const s = stats || { points: 0, winsPvP: 0, winsSolo: 0, losses: 0 };
  const wins = (s.winsPvP || 0) + (s.winsSolo || 0);
  const losses = s.losses || 0;
  const played = wins + losses;
  const rate = played ? Math.round((wins / played) * 100) : 0;

  if (!played) {
    dom.historyList.innerHTML =
      '<li>Nenhuma partida disputada ainda.</li><li>Vença combates para subir de patente.</li>';
    return;
  }

  dom.historyList.innerHTML = [
    `Partidas: ${played}`,
    `Vitórias: ${wins} (${s.winsPvP || 0} online · ${s.winsSolo || 0} solo)`,
    `Derrotas: ${losses}`,
    `Taxa de vitória: ${rate}%`,
    `Pontos: ${s.points || 0}`,
  ]
    .map((i) => `<li>${i}</li>`)
    .join('');
}

export function showLoginScreen() {
  state.currentScreen = 'login';
  dom.loginScreen?.classList.remove('hidden');
  dom.lobbyScreen?.classList.add('hidden');
  dom.lobbyScreen?.classList.remove('visible');
  dom.battleScreen?.classList.add('hidden');
  dom.battleScreen?.classList.remove('visible');
  playLoginVideo();
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
  pauseLoginVideo();
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
  syncTurnIndicator(mode);
  pauseLoginVideo();
  startAmbientSound();
}

export function setBattleMode(mode) {
  state.battleMode = mode;
  if (dom.tacticalBoard) {
    dom.tacticalBoard.dataset.mode = mode;
  }
  syncTurnIndicator(mode);
}

// The fire button used to look available at all times, so there was no
// way to tell whose turn it was. Now it is genuinely disabled off-turn
// and a banner states plainly who is playing.
export function syncTurnIndicator(mode) {
  const myTurn = mode === 'targeting';

  if (dom.fireButton) {
    dom.fireButton.disabled = !myTurn;
    dom.fireButton.classList.toggle('fire-button-off', !myTurn);
  }
  if (dom.turnIndicator) {
    dom.turnIndicator.textContent = myTurn ? 'SUA VEZ' : 'VEZ DO ADVERSÁRIO';
    dom.turnIndicator.classList.toggle('turn-indicator-mine', myTurn);
    dom.turnIndicator.classList.toggle('turn-indicator-theirs', !myTurn);
  }
}

export function openOptions() {
  dom.optionsPanel?.classList.remove('hidden');
}

export function closeOptions() {
  dom.optionsPanel?.classList.add('hidden');
}
