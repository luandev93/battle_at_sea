import { dom } from './dom.js';
import { state } from './state.js';
import { clamp, coordToCellId, cellIdToCoord } from './utils.js';
import { createFleet, applyShotToFleet, isFleetSunk } from './fleet.js';
import { BotAI } from './botAI.js';
import { maybeActivatePowerUp, setupSoloPowerUps } from './powerups.js';
import { markSunkShipCells, clearBoardShots, getCellElement } from './board.js';
import { setBattleStatus, displayError, showBattleScreen } from './ui.js';
import { startReload } from './ammo.js';
import { playShotSound, playEnemyShotSound } from './audio.js';
import { awardPoints } from './stats.js';
import { emitFireCannon, emitFireResponse, emitDeclineMatch, emitForfeitBattle } from './network.js';

// --- Solo mode -------------------------------------------------------

export function startSoloMode() {
  if (!state.fleetSaved) {
    alert('Salve sua frota antes de iniciar uma partida solo.');
    return;
  }

  state.isSoloMode = true;
  state.botAI = new BotAI(10);
  state.soloEnemyFleet = createFleet();
  setupSoloPowerUps();

  state.isPlayerTurn = true;
  state.canShoot = true;
  state.extraShotActive = false;
  clearBoardShots();
  showBattleScreen();
  setBattleStatus('Modo solo iniciado. Sua vez.');
}

function processPlayerShot(cell) {
  if (!cell || cell.dataset.shot) return;

  cell.dataset.shot = 'true';
  const cellId = cell.dataset.cell;
  const powerUpType = maybeActivatePowerUp(cellId, true);
  const { hit, sunk, ship } = applyShotToFleet(state.soloEnemyFleet, cellId);

  if (hit) {
    cell.classList.add('board-cell-hit');
    if (sunk && ship) markSunkShipCells(ship);
  } else {
    cell.classList.add('board-cell-miss');
  }

  if (powerUpType === 'extra_shot') {
    setBattleStatus('Tiro Extra ativado! Dispare novamente sem perder o turno.');
    return;
  }

  setBattleStatus(hit ? 'Acertou! Aguarde a vez do bot...' : 'Água! Agora é a vez do bot.');

  if (hit && sunk && isFleetSunk(state.soloEnemyFleet)) {
    setBattleStatus('Você derrotou o bot!');
    awardPoints(1, 'solo_win');
    return;
  }

  state.isPlayerTurn = false;
  setTimeout(() => botTakeTurn(), 700);
}

function botTakeTurn() {
  if (!state.playerFleet || !state.botAI) return;

  const shotId = state.botAI.nextShot();
  if (!shotId) return;

  const cell = getCellElement(shotId);
  if (cell) cell.dataset.shot = 'true';

  try {
    playEnemyShotSound();
  } catch (e) {
    // audio is best-effort; a failure here should never block gameplay
  }

  maybeActivatePowerUp(shotId, false);
  const { hit, sunk } = applyShotToFleet(state.playerFleet, shotId);
  state.botAI.recordResult(shotId, hit, sunk);

  if (cell) {
    if (hit) {
      cell.classList.add('board-cell-bot-hit');
      if (sunk) {
        const { row, col } = cellIdToCoord(shotId);
        const ship = state.playerFleet.grid[row][col];
        if (ship) markSunkShipCells(ship);
      }
    } else {
      cell.classList.add('board-cell-bot-miss');
    }
  }

  if (hit && sunk && isFleetSunk(state.playerFleet)) {
    setBattleStatus('O bot venceu!');
    return;
  }

  setBattleStatus(hit ? 'O bot acertou! Sua vez.' : 'O bot errou. Agora é sua vez.');
  state.isPlayerTurn = true;
}

// --- Aiming (periscope reticle + cannon) ------------------------------

function updateCannonRotation(reticleX, reticleY) {
  if (!dom.cannon) return;
  const cannonRect = dom.cannon.getBoundingClientRect();
  const centerX = cannonRect.left + cannonRect.width / 2;
  const centerY = cannonRect.top + cannonRect.height / 2;
  const angle = Math.atan2(reticleY - centerY, reticleX - centerX) * (180 / Math.PI);
  dom.cannon.style.transform = `translateX(-50%) rotate(${angle}deg)`;
}

function updateReticlePosition(clientX, clientY) {
  if (!dom.board || !dom.periscopeReticle) return;

  const bounds = dom.board.getBoundingClientRect();
  const x = clamp(clientX - bounds.left, 0, bounds.width);
  const y = clamp(clientY - bounds.top, 0, bounds.height);

  state.lastReticleClientX = bounds.left + x;
  state.lastReticleClientY = bounds.top + y;

  dom.periscopeReticle.style.left = `${x}px`;
  dom.periscopeReticle.style.top = `${y}px`;
  dom.periscopeReticle.style.transform = 'translate(-50%, -50%)';
  updateCannonRotation(state.lastReticleClientX, state.lastReticleClientY);
}

function findCellFromPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  return element?.closest('.board-cell') || null;
}

// --- Firing ------------------------------------------------------------

function sendFireCommand(cell) {
  if (!state.canShoot || !state.isPlayerTurn || !cell) return;
  if (cell.dataset.shot) return;

  cell.dataset.shot = 'true';
  state.canShoot = false;
  startReload();

  if (state.isSoloMode) {
    playShotSound();
    processPlayerShot(cell);
    return;
  }

  playShotSound();
  emitFireCannon(cell.dataset.cell);
}

export function handleForfeit() {
  const confirmed = window.confirm('Deseja desistir desta partida? Isso concederá vitória por W.O. ao oponente.');
  if (!confirmed) return;

  if (state.isSoloMode) {
    setBattleStatus('Você desistiu. Vitória por W.O. do bot.');
    return;
  }

  emitForfeitBattle();
  setBattleStatus('Você desistiu. Vitória por W.O. concedida ao adversário.');
}

// --- Board input handlers (wired in main.js) ----------------------------

export function handleBoardPointerMove(event) {
  updateReticlePosition(event.clientX, event.clientY);
}

export function handleBoardTouchMove(event) {
  if (!event.touches.length) return;
  event.preventDefault();
  const touch = event.touches[0];
  updateReticlePosition(touch.clientX, touch.clientY);
}

export function handleBoardClick(event) {
  const targetCell = event.target.closest('.board-cell');
  if (!targetCell) return;
  updateReticlePosition(event.clientX, event.clientY);
  sendFireCommand(targetCell);
}

export function handleBoardTouchStart(event) {
  if (!event.touches.length) return;
  event.preventDefault();
  const touch = event.touches[0];
  updateReticlePosition(touch.clientX, touch.clientY);
  sendFireCommand(findCellFromPoint(touch.clientX, touch.clientY));
}

export function handleSpacebar(event) {
  if (event.code !== 'Space' || event.target.matches('input, textarea, button')) return;
  event.preventDefault();
  if (state.lastReticleClientX === null || state.lastReticleClientY === null) return;
  sendFireCommand(findCellFromPoint(state.lastReticleClientX, state.lastReticleClientY));
}

// --- Multiplayer socket reactions (wired in main.js) ---------------------

export function handleOpponentFire({ cell, shooterIndex }) {
  const cellEl = getCellElement(cell);
  let hit = false;
  let sunk = false;
  let defeated = false;
  let ship = null;

  if (state.playerFleet) {
    const result = applyShotToFleet(state.playerFleet, cell);
    hit = result.hit;
    sunk = result.sunk;
    ship = result.ship;
    if (sunk && isFleetSunk(state.playerFleet)) {
      defeated = true;
    }
  }

  if (cellEl) {
    cellEl.dataset.shot = 'true';
    if (hit) {
      cellEl.classList.add('board-cell-bot-hit');
      if (sunk && ship) markSunkShipCells(ship);
    } else {
      cellEl.classList.add('board-cell-miss');
    }
  }

  try {
    playEnemyShotSound();
  } catch (e) {
    // best-effort sound
  }

  emitFireResponse({ cell, shooterIndex, hit, sunk, defeated });
}

export function handleMatchFound({ playerIndex, isPlayerTurn }) {
  state.playerIndex = playerIndex;
  state.isPlayerTurn = isPlayerTurn;

  if (!state.fleetSaved) {
    emitDeclineMatch();
    setBattleStatus('Partida recusada: salve sua frota antes de batalhar.');
    return;
  }

  showBattleScreen();
  setBattleStatus(
    isPlayerTurn ? 'Partida online iniciada. Sua vez.' : 'Partida online iniciada. Aguarde o turno do adversário.'
  );
}

export function handleShotResult(payload) {
  const { cell, shooterIndex, nextTurn, hit, sunk, defeated, winner } = payload;
  const targetCell = getCellElement(cell);
  const isShooter = state.playerIndex === shooterIndex;

  if (targetCell) {
    if (typeof hit !== 'undefined') {
      targetCell.classList.add(isShooter ? (hit ? 'board-cell-hit' : 'board-cell-miss') : hit ? 'board-cell-fleet-hit' : 'board-cell-miss');

      if (sunk) {
        setBattleStatus(isShooter ? 'Você afundou um navio!' : 'Seu navio foi afundado!');
        targetCell.classList.add('board-cell-sunk');
      }
      if (defeated) {
        setBattleStatus(winner === state.playerIndex ? 'Você venceu a partida!' : 'Você perdeu a partida.');
      }
    } else {
      targetCell.classList.add('board-cell-miss');
    }
  }

  state.isPlayerTurn = state.playerIndex === nextTurn;
}

export function handleBattleForfeit({ winner }) {
  if (state.playerIndex === winner) {
    setBattleStatus('Vitória por W.O.! Seu oponente desistiu.');
    awardPoints(5, 'pvp_win');
  } else {
    setBattleStatus('Sua equipe perdeu por W.O..');
  }
  state.isPlayerTurn = false;
}

export function handleWaitingForOpponent() {
  setBattleStatus('Aguardando oponente online...');
}

export function handleOpponentLeft() {
  displayError('Oponente desconectado. Aguarde novo adversário.');
  setBattleStatus('Oponente saiu. Retornando ao lobby em breve...');
  state.isPlayerTurn = false;
}
