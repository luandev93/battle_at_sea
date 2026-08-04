import { dom } from './dom.js';
import { state } from './state.js';
import { clamp, coordToCellId, cellIdToCoord, GRID_SIZE } from './utils.js';
import { createFleet, applyShotToFleet, isFleetSunk } from './fleet.js';
import { BotAI } from './botAI.js';
import { maybeActivatePowerUp, setupSoloPowerUps } from './powerups.js';
import { markSunkShipCells, clearGridShots, getCellElement, renderFleetOnGrid } from './board.js';
import { setBattleStatus, setTargetBadge, displayError, showBattleScreen, setBattleMode } from './ui.js';
import { startTurnClock, stopTurnClock, setTurnExpiryHandler } from './turnClock.js';
import { chainsOnHit, firesOnTap, applyMatchConfig } from './matchConfig.js';
import { getShipIconSvg } from './shipIcons.js';
import { getShipLabel } from './fleetBlueprints.js';
import { revealWaterAroundShip } from './fleet.js';
import { playShotSound, playEnemyShotSound } from './audio.js';
import { awardPoints } from './stats.js';
import { emitFireCannon, emitFireResponse, emitDeclineMatch, emitForfeitBattle } from './network.js';

// Centralises every turn handover so the clock, the UI lock and the
// turn flag can never drift apart.
function beginPlayerTurn(message) {
  state.isPlayerTurn = true;
  state.canShoot = true;
  setBattleMode('targeting');
  if (message) setBattleStatus(message);
  startTurnClock();
}

function endPlayerTurn(message) {
  state.isPlayerTurn = false;
  state.canShoot = false;
  setBattleMode('waiting');
  if (message) setBattleStatus(message);
  stopTurnClock();
}

function finishMatch(message, won = null) {
  state.isPlayerTurn = false;
  state.canShoot = false;
  setBattleMode('waiting');
  setBattleStatus(message);
  stopTurnClock();
  showMatchResult(message, won);
}

// The board used to just freeze once a side was wiped out, with no way
// forward. This presents the outcome and the ways out of it.
function showMatchResult(message, won) {
  const panel = dom.resultPanel;
  if (!panel) return;

  if (dom.resultTitle) {
    dom.resultTitle.textContent = won === true ? 'VITÓRIA' : won === false ? 'DERROTA' : 'FIM DE PARTIDA';
    dom.resultTitle.className = `result-title${won === true ? ' result-win' : won === false ? ' result-loss' : ''}`;
  }
  if (dom.resultMessage) dom.resultMessage.textContent = message;
  panel.classList.remove('hidden');
}

export function hideMatchResult() {
  dom.resultPanel?.classList.add('hidden');
}

// --- Solo mode -------------------------------------------------------

export function startSoloMode() {
  if (!state.fleetSaved) {
    alert('Salve sua frota antes de iniciar uma partida solo.');
    return;
  }

  state.isSoloMode = true;
  state.botAI = new BotAI(GRID_SIZE);
  state.soloEnemyFleet = createFleet();
  setupSoloPowerUps();

  state.extraShotActive = false;
  stopTurnClock();

  clearGridShots(dom.enemyGrid);
  clearGridShots(dom.myGrid);
  renderFleetOnGrid(dom.myGrid, state.playerFleet);
  renderEnemyFleetStatus();

  showBattleScreen('targeting');
  beginPlayerTurn('Combate iniciado. Sua vez.');
}

// The caller (sendFireCommand) has already validated the cell and marked
// it as fired; re-checking dataset.shot here aborted every single shot.
function processPlayerShot(cell) {
  if (!cell) return;

  const cellId = cell.dataset.cell;
  const powerUpType = maybeActivatePowerUp(cellId, true);
  const { hit, sunk, ship } = applyShotToFleet(state.soloEnemyFleet, cellId);

  playImpact(cell, hit);
  if (hit) {
    cell.classList.add('board-cell-hit');
    if (sunk && ship) {
      markSunkShipCells(dom.enemyGrid, ship);
      autoRevealWater(dom.enemyGrid, ship);
      renderEnemyFleetStatus();
    }
  } else {
    cell.classList.add('board-cell-miss');
  }

  if (hit && sunk && isFleetSunk(state.soloEnemyFleet)) {
    finishMatch('Sua frota dominou o mar. O adversário foi ao fundo.', true);
    awardPoints(2, 'solo_win');
    return;
  }

  if (powerUpType === 'extra_shot') {
    beginPlayerTurn('Tiro Extra ativado! Dispare novamente.');
    return;
  }

  // Chained turns are what give the match its pace: keep firing while
  // you connect, hand over only on a miss.
  if (hit && chainsOnHit()) {
    beginPlayerTurn('Acertou! Dispare novamente.');
    return;
  }

  endPlayerTurn(hit ? 'Acertou! Vez do adversário.' : 'Água! Vez do adversário.');
  setTimeout(() => botTakeTurn(), 700);
}

function botTakeTurn() {
  if (!state.playerFleet || !state.botAI) return;

  const shotId = state.botAI.nextShot();
  // No cells left to fire at. Hand the turn back instead of returning
  // early, which used to leave the board frozen in 'waiting' forever.
  if (!shotId) {
    beginPlayerTurn('O bot não tem mais alvos. Sua vez.');
    return;
  }

  const cell = getCellElement(dom.myGrid, shotId);
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
    playImpact(cell, hit);
    if (hit) {
      cell.classList.add('board-cell-bot-hit');
      if (sunk) {
        const { row, col } = cellIdToCoord(shotId);
        const ship = state.playerFleet.grid[row][col];
        if (ship) markSunkShipCells(dom.myGrid, ship);
      }
    } else {
      cell.classList.add('board-cell-bot-miss');
    }
  }

  if (hit && sunk && isFleetSunk(state.playerFleet)) {
    awardPoints(0, 'solo_loss');
    finishMatch('Sua frota foi afundada. O adversário venceu.', false);
    return;
  }

  if (hit && chainsOnHit()) {
    setBattleStatus('O bot acertou e dispara de novo...');
    setTimeout(() => botTakeTurn(), 700);
    return;
  }

  beginPlayerTurn(hit ? 'O bot acertou. Sua vez.' : 'O bot errou. Sua vez.');
}


// Marks the ring of guaranteed-water cells around a ship that just sank.
function autoRevealWater(container, ship) {
  revealWaterAroundShip(ship).forEach((cellId) => {
    const cell = getCellElement(container, cellId);
    if (!cell || cell.dataset.shot) return;
    cell.dataset.shot = 'true';
    cell.classList.add('board-cell-miss', 'board-cell-auto');
  });
}

// Silhouettes of the enemy fleet, struck through as each one goes down,
// so the player can see what is still out there.
function renderEnemyFleetStatus() {
  if (!dom.enemyFleetStatus) return;
  const fleet = state.soloEnemyFleet;
  if (!fleet) {
    dom.enemyFleetStatus.innerHTML = '';
    return;
  }

  dom.enemyFleetStatus.innerHTML = fleet.ships
    .map((ship) => {
      const down = ship.hits.size >= ship.size;
      return `<span class="fleet-chip${down ? ' fleet-chip-down' : ''}" title="${getShipLabel(ship)}">${getShipIconSvg(ship.type)}</span>`;
    })
    .join('');
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

function updateTargetBadge(clientX, clientY) {
  if (state.battleMode !== 'targeting') return;
  const cell = document.elementFromPoint(clientX, clientY)?.closest('.board-cell');
  if (!cell || !dom.enemyGrid?.contains(cell)) {
    setTargetBadge('SALVA PRONTA');
    return;
  }
  setTargetBadge(cell.dataset.shot ? 'ALVO JÁ ATINGIDO' : 'ALVO TRAVADO');
}

function updateReticlePosition(clientX, clientY) {
  if (!dom.enemyGrid || !dom.periscopeReticle) return;

  const bounds = dom.enemyGrid.getBoundingClientRect();
  const x = clamp(clientX - bounds.left, 0, bounds.width);
  const y = clamp(clientY - bounds.top, 0, bounds.height);

  state.lastReticleClientX = bounds.left + x;
  state.lastReticleClientY = bounds.top + y;

  dom.periscopeReticle.style.left = `${x}px`;
  dom.periscopeReticle.style.top = `${y}px`;
  dom.periscopeReticle.style.transform = 'translate(-50%, -50%)';
  updateCannonRotation(state.lastReticleClientX, state.lastReticleClientY);
  updateTargetBadge(clientX, clientY);
}

function findCellFromPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  return element?.closest('.board-cell') || null;
}


// --- Cell selection: move the reticle cell by cell, like a spreadsheet ---

// Keeps a logical selected cell so the reticle can be walked with the
// arrow keys instead of only chasing a pointer. Tapping a cell selects
// it; firing acts on the selection.
function setSelectedCell(cellId, { scroll = false } = {}) {
  if (!cellId) return;
  state.selectedCellId = cellId;

  dom.enemyGrid?.querySelectorAll('.board-cell-selected').forEach((c) => c.classList.remove('board-cell-selected'));
  const cell = getCellElement(dom.enemyGrid, cellId);
  if (!cell) return;
  cell.classList.add('board-cell-selected');

  const rect = cell.getBoundingClientRect();
  const gridRect = dom.enemyGrid.getBoundingClientRect();
  state.lastReticleClientX = rect.left + rect.width / 2;
  state.lastReticleClientY = rect.top + rect.height / 2;

  if (dom.periscopeReticle) {
    dom.periscopeReticle.style.left = `${rect.left - gridRect.left + rect.width / 2}px`;
    dom.periscopeReticle.style.top = `${rect.top - gridRect.top + rect.height / 2}px`;
    dom.periscopeReticle.style.transform = 'translate(-50%, -50%)';
  }
  updateCannonRotation(state.lastReticleClientX, state.lastReticleClientY);
  setTargetBadge(cell.dataset.shot ? 'ALVO JÁ ATINGIDO' : 'ALVO TRAVADO');
  if (scroll) cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function moveSelection(dRow, dCol) {
  if (state.battleMode !== 'targeting') return;
  const current = state.selectedCellId || 1;
  const { row, col } = cellIdToCoord(current);
  const r = clamp(row + dRow, 0, GRID_SIZE - 1);
  const c = clamp(col + dCol, 0, GRID_SIZE - 1);
  setSelectedCell(coordToCellId(r, c), { scroll: true });
}

export function handleArrowKeys(event) {
  const map = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  const delta = map[event.key];
  if (!delta || state.battleMode !== 'targeting') return;
  if (event.target.matches('input, textarea')) return;
  event.preventDefault();
  moveSelection(delta[0], delta[1]);
}

// Muzzle flash + recoil + screen shake, so a shot has weight.
function playFireAnimation() {
  dom.tacticalBoard?.classList.add('screen-shake');
  setTimeout(() => dom.tacticalBoard?.classList.remove('screen-shake'), 220);

  if (dom.cannon) {
    dom.cannon.classList.add('cannon-recoil');
    setTimeout(() => dom.cannon.classList.remove('cannon-recoil'), 260);
  }
  if (dom.muzzleFlash) {
    dom.muzzleFlash.classList.remove('muzzle-flash-on');
    void dom.muzzleFlash.offsetWidth; // restart the animation
    dom.muzzleFlash.classList.add('muzzle-flash-on');
  }
}

// Impact marker animation on the targeted cell.
function playImpact(cell, hit) {
  if (!cell) return;
  cell.classList.add(hit ? 'impact-hit' : 'impact-miss');
  setTimeout(() => cell.classList.remove('impact-hit', 'impact-miss'), 500);
}

// --- Firing ------------------------------------------------------------

function sendFireCommand(cell) {
  if (!state.canShoot || !state.isPlayerTurn || !cell) return;
  if (state.battleMode !== 'targeting') return;
  if (cell.dataset.shot) return;

  cell.dataset.shot = 'true';
  state.canShoot = false;
  playFireAnimation();
  playShotSound();

  if (state.isSoloMode) {
    processPlayerShot(cell);
    return;
  }

  emitFireCannon(cell.dataset.cell);
}

export function handleForfeit() {
  const confirmed = window.confirm('Deseja desistir desta partida? Isso concederá vitória por W.O. ao oponente.');
  if (!confirmed) return;

  if (state.isSoloMode) {
    finishMatch('Você desistiu do combate.', false);
    return;
  }

  emitForfeitBattle();
  setBattleStatus('Você desistiu. Vitória por W.O. concedida ao adversário.');
  setBattleMode('waiting');
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

// Tapping a cell aims and fires in one gesture. The arrow keys move the
// selection without firing, and the FOGO button shoots at the selection,
// for players who want to line the shot up first.
export function handleBoardClick(event) {
  const targetCell = event.target.closest('.board-cell');
  if (!targetCell) return;
  setSelectedCell(targetCell.dataset.cell);
  if (firesOnTap()) sendFireCommand(targetCell);
}

export function handleBoardTouchStart(event) {
  if (!event.touches.length) return;
  event.preventDefault();
  const cell = findCellFromPoint(event.touches[0].clientX, event.touches[0].clientY);
  if (!cell) return;
  setSelectedCell(cell.dataset.cell);
  if (firesOnTap()) sendFireCommand(cell);
}

// The dedicated FOGO button fires at wherever the reticle currently is,
// so the player can aim with one thumb and fire with the other instead
// of having to tap the exact target cell.
export function handleFireButton() {
  if (!state.selectedCellId) {
    setBattleStatus('Toque numa casa inimiga para mirar antes de disparar.');
    return;
  }
  sendFireCommand(getCellElement(dom.enemyGrid, state.selectedCellId));
}

export function handleSpacebar(event) {
  if (event.code !== 'Space' || event.target.matches('input, textarea, button')) return;
  event.preventDefault();
  if (state.lastReticleClientX === null || state.lastReticleClientY === null) return;
  sendFireCommand(findCellFromPoint(state.lastReticleClientX, state.lastReticleClientY));
}

// A turn clock running out simply forfeits that turn.
setTurnExpiryHandler(() => {
  if (!state.isPlayerTurn) return;
  if (state.isSoloMode) {
    endPlayerTurn('Tempo esgotado! Vez do adversário.');
    setTimeout(() => botTakeTurn(), 500);
  } else {
    endPlayerTurn('Tempo esgotado! Vez do adversário.');
  }
});

// --- Multiplayer socket reactions (wired in main.js) ---------------------

export function handleOpponentFire({ cell, shooterIndex }) {
  const cellEl = getCellElement(dom.myGrid, cell);
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
      if (sunk && ship) markSunkShipCells(dom.myGrid, ship);
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

export function handleMatchFound({ playerIndex, isPlayerTurn, config, opponent }) {
  state.playerIndex = playerIndex;
  state.isPlayerTurn = isPlayerTurn;
  state.isSoloMode = false;

  // The server only pairs players queued for the same map, so only the
  // rules travel with the room. Resizing the board here would invalidate
  // the fleet the player already placed.
  if (config && Object.keys(config).length) {
    const { map, ...rules } = config;
    applyMatchConfig(rules);
  }
  if (opponent) state.opponentName = opponent;

  if (!state.fleetSaved) {
    emitDeclineMatch();
    // The player is still on the lobby here, so the battle-screen status
    // element is invisible. Report it somewhere they can actually see.
    if (dom.fleetConfigStatus) {
      dom.fleetConfigStatus.textContent = 'Partida recusada: configure e salve sua frota para batalhar.';
    }
    setBattleStatus('Partida recusada: salve sua frota antes de batalhar.');
    return;
  }

  clearGridShots(dom.enemyGrid);
  clearGridShots(dom.myGrid);
  renderFleetOnGrid(dom.myGrid, state.playerFleet);

  renderEnemyFleetStatus();
  showBattleScreen(isPlayerTurn ? 'targeting' : 'waiting');

  const vs = state.opponentName ? ` contra ${state.opponentName}` : '';
  if (isPlayerTurn) {
    beginPlayerTurn(`Combate${vs} iniciado. Sua vez.`);
  } else {
    endPlayerTurn(`Combate${vs} iniciado. Aguarde o adversário.`);
  }
}

export function handleShotResult(payload) {
  const { cell, shooterIndex, nextTurn, hit, sunk, defeated, winner } = payload;
  const isShooter = state.playerIndex === shooterIndex;

  // Only the shooter paints anything here. The defender already resolved
  // and drew this exact shot locally in handleOpponentFire; painting it
  // again from the broadcast just stacked a second, conflicting class on
  // the same cell.
  if (isShooter) {
    const targetCell = getCellElement(dom.enemyGrid, cell);
    if (targetCell) {
      targetCell.classList.add(hit ? 'board-cell-hit' : 'board-cell-miss');
      if (sunk) targetCell.classList.add('board-cell-sunk');
    }
  }

  if (sunk) {
    setBattleStatus(isShooter ? 'Você afundou um navio!' : 'Seu navio foi afundado!');
  }
  if (defeated) {
    setBattleStatus(winner === state.playerIndex ? 'Você venceu a partida!' : 'Você perdeu a partida.');
    if (winner === state.playerIndex) awardPoints(5, 'pvp_win');
  }

  if (defeated) {
    finishMatch(
      winner === state.playerIndex ? 'Você venceu a partida!' : 'Você perdeu a partida.',
      winner === state.playerIndex
    );
    if (winner !== state.playerIndex) awardPoints(0, 'pvp_loss');
    return;
  }

  if (state.playerIndex === nextTurn) {
    beginPlayerTurn(null);
  } else {
    endPlayerTurn(null);
  }
}

export function handleBattleForfeit({ winner }) {
  if (state.playerIndex === winner) {
    setBattleStatus('Vitória por W.O.! Seu oponente desistiu.');
    awardPoints(3, 'pvp_win');
  } else {
    setBattleStatus('Sua equipe perdeu por W.O..');
  }
  state.isPlayerTurn = false;
  setBattleMode('waiting');
}

export function handleWaitingForOpponent() {
  setBattleStatus('Aguardando oponente online...');
}

export function handleOpponentLeft() {
  displayError('Oponente desconectado. Aguarde novo adversário.');
  setBattleStatus('Oponente saiu. Retornando ao lobby em breve...');
  state.isPlayerTurn = false;
  setBattleMode('waiting');
}
