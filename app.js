import { auth } from './firebase-config.js';
import {
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const togglePasswordButton = document.getElementById('toggle-password');
const capsLockWarning = document.getElementById('caps-lock-warning');
const rememberMeCheckbox = document.getElementById('remember-me');
const forgotPasswordButton = document.getElementById('forgot-password-button');
const signInButton = document.getElementById('sign-in-button');
const signUpButton = document.getElementById('sign-up-button');
const errorMessage = document.getElementById('error-message');
const loginScreen = document.getElementById('login-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const battleScreen = document.getElementById('battle-screen');
const board = document.getElementById('board');
const periscopeReticle = document.getElementById('periscope-reticle');
const cannon = document.getElementById('rustic-cannon');
const ammoCounter = document.getElementById('ammo-counter');
const ammoValue = ammoCounter?.querySelector('.ammo-value');

const socket = io();
let playerIndex = null;
let isPlayerTurn = false;
let canShoot = true;
let reloadInterval = null;
let lastReticleClientX = null;
let lastReticleClientY = null;
let isSoloMode = false;
let botAI = null;
let soloEnemyFleet = null;
let playerFleet = null;
const shipSizes = [5, 4, 3, 3, 2];
const startSoloButton = document.getElementById('start-solo-button');
const battleStatus = document.getElementById('battle-status');

function coordToCellId(row, col) {
  return row * 10 + col + 1;
}

function cellIdToCoord(cellId) {
  const index = Number(cellId) - 1;
  return {
    row: Math.floor(index / 10),
    col: index % 10,
  };
}

function getNeighbors(row, col) {
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ].filter((coord) => coord.row >= 0 && coord.row < 10 && coord.col >= 0 && coord.col < 10);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

class BotAI {
  constructor(gridSize = 10) {
    this.gridSize = gridSize;
    this.availableShots = new Set(Array.from({ length: gridSize * gridSize }, (_, i) => i + 1));
    this.mode = 'hunt';
    this.targetQueue = [];
    this.hitCells = [];
  }

  getRandomShot() {
    const shots = Array.from(this.availableShots);
    if (!shots.length) {
      return null;
    }
    const index = Math.floor(Math.random() * shots.length);
    return shots[index];
  }

  addTarget(row, col) {
    const cellId = coordToCellId(row, col);
    if (this.availableShots.has(cellId) && !this.targetQueue.includes(cellId)) {
      this.targetQueue.push(cellId);
    }
  }

  nextShot() {
    if (this.mode === 'target' && this.targetQueue.length > 0) {
      return this.targetQueue.shift();
    }

    this.mode = 'hunt';
    return this.getRandomShot();
  }

  recordResult(cellId, wasHit, sunk) {
    this.availableShots.delete(Number(cellId));

    if (!wasHit) {
      return;
    }

    const { row, col } = cellIdToCoord(cellId);
    this.hitCells.push({ row, col });

    if (sunk) {
      this.mode = 'hunt';
      this.hitCells = [];
      this.targetQueue = [];
      return;
    }

    if (this.mode === 'hunt') {
      this.mode = 'target';
      getNeighbors(row, col).forEach(({ row: r, col: c }) => this.addTarget(r, c));
      return;
    }

    if (this.mode === 'target') {
      const primaryHit = this.hitCells[0];
      const dx = row - primaryHit.row;
      const dy = col - primaryHit.col;

      if (Math.abs(dx) + Math.abs(dy) === 1) {
        const nextRow = row + dx;
        const nextCol = col + dy;
        if (nextRow >= 0 && nextRow < this.gridSize && nextCol >= 0 && nextCol < this.gridSize) {
          this.addTarget(nextRow, nextCol);
        }
        const backRow = primaryHit.row - dx;
        const backCol = primaryHit.col - dy;
        if (backRow >= 0 && backRow < this.gridSize && backCol >= 0 && backCol < this.gridSize) {
          this.addTarget(backRow, backCol);
        }
      }

      if (this.targetQueue.length === 0) {
        getNeighbors(row, col).forEach(({ row: r, col: c }) => this.addTarget(r, c));
      }
    }
  }
}

function createFleet() {
  const grid = Array.from({ length: 10 }, () => Array(10).fill(null));
  const ships = [];

  for (const size of shipSizes) {
    let placed = false;
    const attemptLimit = 200;
    let attempts = 0;

    while (!placed && attempts < attemptLimit) {
      attempts += 1;
      const horizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * 10);
      const col = Math.floor(Math.random() * 10);
      const coords = [];

      for (let offset = 0; offset < size; offset += 1) {
        const r = horizontal ? row : row + offset;
        const c = horizontal ? col + offset : col;
        if (r >= 10 || c >= 10 || grid[r][c] !== null) {
          coords.length = 0;
          break;
        }
        coords.push({ row: r, col: c });
      }

      if (coords.length === size) {
        const ship = {
          size,
          coords,
          hits: new Set(),
        };
        ships.push(ship);
        coords.forEach(({ row: r, col: c }) => {
          grid[r][c] = ship;
        });
        placed = true;
      }
    }
  }

  return { grid, ships };
}

function applyShotToFleet(fleet, cellId) {
  const { row, col } = cellIdToCoord(cellId);
  const ship = fleet.grid[row][col];

  if (!ship) {
    return { hit: false, sunk: false };
  }

  const coordKey = `${row},${col}`;
  ship.hits.add(coordKey);
  const sunk = ship.hits.size === ship.size;
  return { hit: true, sunk };
}

function isFleetSunk(fleet) {
  return fleet.ships.every((ship) => ship.hits.size === ship.size);
}

function clearBoardShots() {
  board?.querySelectorAll('.board-cell').forEach((cell) => {
    cell.classList.remove('board-cell-shot', 'board-cell-miss', 'board-cell-bot-hit', 'board-cell-bot-miss', 'board-cell-fleet-hit');
    delete cell.dataset.shot;
  });
}

function startSoloMode() {
  isSoloMode = true;
  botAI = new BotAI(10);
  soloEnemyFleet = createFleet();
  playerFleet = createFleet();
  isPlayerTurn = true;
  canShoot = true;
  clearBoardShots();
  showBattleScreen();
  setBattleStatus('Modo solo iniciado. Sua vez.');
}

window.startSoloMode = startSoloMode;

function processPlayerShot(cell) {
  if (!cell || cell.dataset.shot) {
    return;
  }

  cell.dataset.shot = 'true';
  const cellId = cell.dataset.cell;
  const { hit, sunk } = applyShotToFleet(soloEnemyFleet, cellId);
  highlightCell(cell, hit ? 'board-cell-shot' : 'board-cell-miss');

  setBattleStatus(hit ? 'Acertou! Aguarde a vez do bot...' : 'Água! Agora é a vez do bot.');

  if (hit && sunk && isFleetSunk(soloEnemyFleet)) {
    setBattleStatus('Você derrotou o bot!');
    return;
  }

  isPlayerTurn = false;
  setTimeout(() => botTakeTurn(), 700);
}

function botTakeTurn() {
  if (!playerFleet || !botAI) {
    return;
  }

  const shotId = botAI.nextShot();
  if (!shotId) {
    return;
  }

  const cell = board?.querySelector(`[data-cell="${shotId}"]`);
  if (cell) {
    cell.dataset.shot = 'true';
  }

  const { hit, sunk } = applyShotToFleet(playerFleet, shotId);
  botAI.recordResult(shotId, hit, sunk);

  if (cell) {
    highlightCell(cell, hit ? 'board-cell-bot-hit' : 'board-cell-bot-miss');
  }

  if (hit && sunk && isFleetSunk(playerFleet)) {
    setBattleStatus('O bot venceu!');
    return;
  }

  setBattleStatus(hit ? 'O bot acertou! Sua vez.' : 'O bot errou. Agora é sua vez.');
  isPlayerTurn = true;
}

function displayError(message) {
  if (errorMessage) {
    errorMessage.textContent = message;
  }
}

function clearError() {
  if (errorMessage) {
    errorMessage.textContent = '';
  }
}

function getPersistenceMode() {
  return rememberMeCheckbox?.checked ? browserLocalPersistence : browserSessionPersistence;
}

function togglePasswordVisibility() {
  if (!passwordInput || !togglePasswordButton) {
    return;
  }

  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePasswordButton.textContent = isPassword ? 'Ocultar' : 'Mostrar';
  togglePasswordButton.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
}

function updateCapsLockWarning(event) {
  if (!capsLockWarning) {
    return;
  }

  const isCapsLock = event.getModifierState && event.getModifierState('CapsLock');
  capsLockWarning.hidden = !isCapsLock;
}

function showLobbyScreen() {
  loginScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  lobbyScreen.classList.add('visible');
}

function showBattleScreen() {
  lobbyScreen.classList.add('hidden');
  lobbyScreen.classList.remove('visible');
  battleScreen.classList.remove('hidden');
  battleScreen.classList.add('visible');
}

function getCredentials() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  return { email, password };
}

async function handleSignIn() {
  clearError();
  const { email, password } = getCredentials();

  if (!email || !password) {
    displayError('Preencha email e senha antes de continuar.');
    return;
  }

  try {
    await setPersistence(auth, getPersistenceMode());
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (!user.emailVerified) {
      await signOut(auth);
      displayError('Email não verificado. Verifique seu email antes de entrar.');
      return;
    }

    showLobbyScreen();
  } catch (error) {
    displayError(error.message || 'Falha ao entrar. Verifique suas credenciais.');
  }
}

async function handleSignUp() {
  clearError();
  const { email, password } = getCredentials();

  if (!email || !password) {
    displayError('Preencha email e senha antes de continuar.');
    return;
  }

  if (!email.includes('@')) {
    displayError('Digite um email válido para criar a conta.');
    return;
  }

  try {
    await setPersistence(auth, getPersistenceMode());
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCredential.user);
    await signOut(auth);
    displayError('Conta criada. Verifique seu email e confirme antes de entrar.');
  } catch (error) {
    displayError(error.message || 'Falha ao criar conta. Tente novamente.');
  }
}

async function handlePasswordReset() {
  clearError();
  const email = emailInput.value.trim();

  if (!email) {
    displayError('Digite seu email para redefinir a senha.');
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    displayError('Email de recuperação enviado. Verifique sua caixa de entrada.');
  } catch (error) {
    displayError(error.message || 'Não foi possível enviar a recuperação. Tente novamente.');
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateCannonRotation(reticleX, reticleY) {
  if (!cannon) {
    return;
  }

  const cannonRect = cannon.getBoundingClientRect();
  const centerX = cannonRect.left + cannonRect.width / 2;
  const centerY = cannonRect.top + cannonRect.height / 2;
  const angle = Math.atan2(reticleY - centerY, reticleX - centerX) * (180 / Math.PI);
  cannon.style.transform = `translateX(-50%) rotate(${angle}deg)`;
}

function updateReticlePosition(clientX, clientY) {
  if (!board || !periscopeReticle) {
    return;
  }

  const bounds = board.getBoundingClientRect();
  const x = clamp(clientX - bounds.left, 0, bounds.width);
  const y = clamp(clientY - bounds.top, 0, bounds.height);

  lastReticleClientX = bounds.left + x;
  lastReticleClientY = bounds.top + y;

  periscopeReticle.style.left = `${x}px`;
  periscopeReticle.style.top = `${y}px`;
  periscopeReticle.style.transform = 'translate(-50%, -50%)';
  updateCannonRotation(lastReticleClientX, lastReticleClientY);
}

function resetAmmoDisplay() {
  if (ammoValue) {
    ammoValue.textContent = 'Ready';
  }
}

function setBattleStatus(message) {
  if (battleStatus) {
    battleStatus.textContent = message;
  }
}

function startReload() {
  let remaining = 2.1;
  if (ammoValue) {
    ammoValue.textContent = remaining.toFixed(1);
  }

  reloadInterval = setInterval(() => {
    remaining -= 0.1;
    if (remaining <= 0) {
      clearInterval(reloadInterval);
      reloadInterval = null;
      canShoot = true;
      resetAmmoDisplay();
      return;
    }

    if (ammoValue) {
      ammoValue.textContent = remaining.toFixed(1);
    }
  }, 100);
}

function highlightCell(cell, className = 'board-cell-shot') {
  if (!cell) {
    return;
  }

  cell.classList.add(className);
  setTimeout(() => cell.classList.remove(className), 600);
}

function findCellFromPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  return element?.closest('.board-cell') || null;
}

function sendFireCommand(cell) {
  if (!canShoot || !isPlayerTurn || !cell) {
    return;
  }

  canShoot = false;
  startReload();

  if (isSoloMode) {
    processPlayerShot(cell);
    return;
  }

  const cellId = cell.dataset.cell;
  socket.emit('fire_cannon', { cell: cellId });
}

function handleBoardPointerMove(event) {
  updateReticlePosition(event.clientX, event.clientY);
}

function handleBoardTouchMove(event) {
  if (!event.touches.length) {
    return;
  }

  event.preventDefault();
  const touch = event.touches[0];
  updateReticlePosition(touch.clientX, touch.clientY);
}

function handleBoardClick(event) {
  const targetCell = event.target.closest('.board-cell');
  if (!targetCell) {
    return;
  }

  updateReticlePosition(event.clientX, event.clientY);
  sendFireCommand(targetCell);
}

function handleBoardTouchStart(event) {
  if (!event.touches.length) {
    return;
  }

  event.preventDefault();
  const touch = event.touches[0];
  updateReticlePosition(touch.clientX, touch.clientY);
  const targetCell = findCellFromPoint(touch.clientX, touch.clientY);
  sendFireCommand(targetCell);
}

function handleSpacebar(event) {
  if (event.code !== 'Space' || event.target.matches('input, textarea, button')) {
    return;
  }

  event.preventDefault();
  if (lastReticleClientX === null || lastReticleClientY === null) {
    return;
  }

  const targetCell = findCellFromPoint(lastReticleClientX, lastReticleClientY);
  sendFireCommand(targetCell);
}

socket.on('match_found', ({ playerIndex: index, isPlayerTurn: turn }) => {
  playerIndex = index;
  isPlayerTurn = turn;
  showBattleScreen();
  setBattleStatus(turn ? 'Partida online iniciada. Sua vez.' : 'Partida online iniciada. Aguarde o turno do adversário.');
});

socket.on('shot_result', ({ cell, shooterIndex, nextTurn }) => {
  const targetCell = board?.querySelector(`[data-cell="${cell}"]`);
  if (targetCell) {
    const isShooter = playerIndex === shooterIndex;
    highlightCell(targetCell, isShooter ? 'board-cell-shot' : 'board-cell-fleet-hit');
  }
  isPlayerTurn = playerIndex === nextTurn;
});

socket.on('waiting_for_opponent', () => {
  setBattleStatus('Aguardando oponente online...');
});

socket.on('opponent_left', () => {
  displayError('Oponente desconectado. Aguarde novo adversário.');
  setBattleStatus('Oponente saiu. Retornando ao lobby em breve...');
  isPlayerTurn = false;
});

signInButton.addEventListener('click', handleSignIn);
signUpButton.addEventListener('click', handleSignUp);
forgotPasswordButton?.addEventListener('click', handlePasswordReset);
togglePasswordButton?.addEventListener('click', togglePasswordVisibility);

emailInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    handleSignIn();
  }
});

passwordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    handleSignIn();
  }
  updateCapsLockWarning(event);
});

passwordInput.addEventListener('keyup', updateCapsLockWarning);
passwordInput.addEventListener('focus', updateCapsLockWarning);
passwordInput.addEventListener('blur', () => {
  if (capsLockWarning) {
    capsLockWarning.hidden = true;
  }
});

startSoloButton?.addEventListener('click', startSoloMode);

if (board) {
  board.addEventListener('mousemove', handleBoardPointerMove);
  board.addEventListener('click', handleBoardClick);
  board.addEventListener('touchstart', handleBoardTouchStart, { passive: false });
  board.addEventListener('touchmove', handleBoardTouchMove, { passive: false });
}

document.addEventListener('keydown', handleSpacebar);
resetAmmoDisplay();
