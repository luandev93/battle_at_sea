import { auth } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
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

function displayError(message) {
  errorMessage.textContent = message;
}

function clearError() {
  errorMessage.textContent = '';
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
    await signInWithEmailAndPassword(auth, email, password);
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

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    showLobbyScreen();
  } catch (error) {
    displayError(error.message || 'Falha ao criar conta. Tente novamente.');
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
  // opcional: exibir feedback no lobby
});

socket.on('opponent_left', () => {
  displayError('Oponente desconectado. Aguarde novo adversário.');
  isPlayerTurn = false;
});

signInButton.addEventListener('click', handleSignIn);
signUpButton.addEventListener('click', handleSignUp);

emailInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    handleSignIn();
  }
});

passwordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    handleSignIn();
  }
});

if (board) {
  board.addEventListener('mousemove', handleBoardPointerMove);
  board.addEventListener('click', handleBoardClick);
  board.addEventListener('touchstart', handleBoardTouchStart, { passive: false });
  board.addEventListener('touchmove', handleBoardTouchMove, { passive: false });
}

document.addEventListener('keydown', handleSpacebar);
resetAmmoDisplay();
