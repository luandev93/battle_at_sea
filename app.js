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
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase-config.js';

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
const startSoloButton = document.getElementById('start-solo-button');
const battleStatus = document.getElementById('battle-status');
const forfeitButton = document.getElementById('forfeit-button');
const lobbyVideo = document.getElementById('lobby-video');
const toggleAudioButton = document.getElementById('toggle-audio-button');
const logoutButton = document.getElementById('logout-button');
const optionsButton = document.getElementById('options-button');
let audioMuted = false;

const closeOptionsButton = document.getElementById('close-options-button');
const optionsPanel = document.getElementById('options-panel');
const playerList = document.getElementById('player-list');
const historyList = document.getElementById('history-list');
const playerName = document.getElementById('player-name');
const fleetConfigButton = document.getElementById('fleet-config-button');
const fleetConfigStatus = document.getElementById('fleet-config-status');
const viewHistoryButton = document.getElementById('view-history-button');

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
  const blueprintShips = [];

  fleetBlueprints.forEach((blueprint) => {
    const count = blueprint.count || 1;
    for (let i = 0; i < count; i += 1) {
      blueprintShips.push({ id: `s${blueprintShips.length}`, type: blueprint.type, coords: [], orientation: 'horizontal', dir: 1 });
    }
  });

  const shipsToPlace = [...blueprintShips].sort((a, b) => {
    return (getBlueprint(b.type)?.pattern.length || 0) - (getBlueprint(a.type)?.pattern.length || 0);
  });

  shipsToPlace.forEach((ship) => {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 400) {
      attempts += 1;
      const row = Math.floor(Math.random() * 10);
      const col = Math.floor(Math.random() * 10);
      const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
      const dir = Math.random() < 0.5 ? 1 : -1;
      const cellId = coordToCellId(row, col);
      const coords = coordsForPlacement(cellId, ship, orientation, dir);
      if (!coords || coords.some(({ row: r, col: c }) => grid[r][c] !== null)) continue;
      ship.coords = coords;
      ship.orientation = orientation;
      ship.dir = dir;
      ship.size = coords.length;
      ship.hits = new Set();
      coords.forEach(({ row: r, col: c }) => {
        grid[r][c] = ship;
      });
      ships.push(ship);
      placed = true;
    }
  });

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
  if (!fleetSaved) {
    alert('Salve sua frota antes de iniciar uma partida solo.');
    return;
  }
  isSoloMode = true;
  botAI = new BotAI(10);
  soloEnemyFleet = createFleet();
  // playerFleet set from saved placement
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
    awardPoints(1, 'solo_win');
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

  try { playEnemyShotSound(); } catch (e) {}

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

function fillOnlinePlayers(players = []) {
  if (!playerList) {
    return;
  }

  playerList.innerHTML = players.length
    ? players.map((player) => `<li>${player}</li>`).join('')
    : '<li>Aguardando combatentes...</li>';
}

function fillPlayerHistory(email = 'Jogador') {
  if (!historyList) {
    return;
  }
  const history = [
    `Jogador: ${email}`,
    `Última vitória: 3 dias atrás`,
    `Derrotas: 7`,
    `Vitórias: 12`,
    `Taxa de vitória: 63%`,
  ];
  historyList.innerHTML = history.map((item) => `<li>${item}</li>`).join('');
}

// --- Scoring and progression system ---
let currentPlayerId = null; // email or identifier
const patentIcon = document.getElementById('patent-icon');

// WebAudio variables
let audioCtx = null;
let ambientGain = null;
let ambientNodes = null;

function initAudioContext() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function setAudioMuted(value) {
  audioMuted = Boolean(value);
  if (toggleAudioButton) {
    toggleAudioButton.textContent = audioMuted ? 'Som: Mudo' : 'Som: Ligado';
    toggleAudioButton.classList.toggle('active', !audioMuted);
  }
  if (lobbyVideo) {
    lobbyVideo.muted = audioMuted;
    lobbyVideo.volume = audioMuted ? 0 : 1;
    if (!audioMuted) {
      lobbyVideo.play().catch(() => {});
    }
  }
}

function startAmbientSound() {
  if (audioMuted) return;
  initAudioContext();
  if (ambientNodes) return;
  ambientGain = audioCtx.createGain();
  ambientGain.gain.value = 0.0;
  ambientGain.connect(audioCtx.destination);

  const osc1 = audioCtx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 40;

  const osc2 = audioCtx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.value = 65;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(ambientGain);

  osc1.start();
  osc2.start();

  ambientNodes = { osc1, osc2, filter };

  // fade in
  ambientGain.gain.cancelScheduledValues(audioCtx.currentTime);
  ambientGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
  ambientGain.gain.linearRampToValueAtTime(0.16, audioCtx.currentTime + 1.2);
}

function stopAmbientSound() {
  if (!audioCtx || !ambientGain) return;
  ambientGain.gain.cancelScheduledValues(audioCtx.currentTime);
  ambientGain.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + 0.8);
  // stop oscillators after fade-out
  setTimeout(() => {
    if (!ambientNodes) return;
    try {
      ambientNodes.osc1.stop();
      ambientNodes.osc2.stop();
    } catch (e) {}
    ambientNodes = null;
  }, 900);
}

function playShotSound() {
  if (audioMuted) return;
  initAudioContext();
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(900, now);
  osc.frequency.exponentialRampToValueAtTime(120, now + 0.14);

  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.5, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.35);

  // short noise for impact
  const bufferSize = Math.floor(audioCtx.sampleRate * 0.06);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / bufferSize * 6);
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const ng = audioCtx.createGain();
  ng.gain.setValueAtTime(0.6, now);
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  noise.connect(ng);
  ng.connect(audioCtx.destination);
  noise.start(now);
  noise.stop(now + 0.18);
}

function playEnemyShotSound() {
  if (audioMuted) return;
  initAudioContext();
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(90, now + 0.2);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  osc.connect(g); g.connect(audioCtx.destination);
  osc.start(now); osc.stop(now + 0.4);
}

function pointsNeeded(n) {
  return 33 * Math.pow(n, 1.5);
}

function levelForPoints(points) {
  let level = 0;
  for (let n = 1; n < 1000; n += 1) {
    if (points >= pointsNeeded(n)) {
      level = n;
    } else {
      break;
    }
  }
  return level; // level 0 means below first threshold
}

function loadStats(id) {
  if (!id) return { points: 0, winsPvP: 0, winsSolo: 0 };
  try {
    const raw = localStorage.getItem(`bas:stats:${id}`);
    return raw ? JSON.parse(raw) : { points: 0, winsPvP: 0, winsSolo: 0 };
  } catch (e) {
    return { points: 0, winsPvP: 0, winsSolo: 0 };
  }
}

function saveStats(id, stats) {
  if (!id) return;
  localStorage.setItem(`bas:stats:${id}`, JSON.stringify(stats));
}

async function saveStatsToFirestore(id, stats) {
  if (!id) return;
  try {
    await setDoc(doc(db, 'users', id), { stats: stats }, { merge: true });
  } catch (e) {
    console.warn('Não foi possível salvar estatísticas no Firestore', e);
  }
}

async function loadStatsFromFirestore(id) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'users', id));
    if (!snap.exists()) return null;
    const data = snap.data();
    return data.stats || null;
  } catch (e) {
    console.warn('Erro ao carregar estatísticas', e);
    return null;
  }
}

async function loadFleetFromFirestore(id) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'users', id));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data.fleet && Array.isArray(data.fleet)) {
      initPlacement();
      data.fleet.forEach((s, idx) => {
        if (placement.ships[idx]) {
          placement.ships[idx].coords = s.coords || [];
          placement.ships[idx].orientation = s.orientation || placement.ships[idx].orientation;
          placement.ships[idx].dir = s.dir || placement.ships[idx].dir;
          placement.ships[idx].type = s.type || placement.ships[idx].type;
          placement.ships[idx].coords.forEach(({ row, col }) => {
            if (placement.grid[row] && placement.grid[row][col] === null) {
              placement.grid[row][col] = placement.ships[idx].id;
            }
          });
        }
      });
      renderPlacementToDOM();
      fleetSaved = true;
      playerFleet = buildPlayerFleetFromPlacement();
      if (fleetConfigStatus) fleetConfigStatus.textContent = 'Frota carregada.';
      return placement;
    }
    return null;
  } catch (e) {
    console.warn('Erro ao carregar frota', e);
    return null;
  }
}

function renderPatentIcon(level) {
  if (!patentIcon) return;
  const icons = ['🔰', '⚓', '🛳️', '🚢', '🦅', '🏅', '🏴‍☠️'];
  const idx = Math.min(level, icons.length - 1);
  patentIcon.textContent = icons[idx] || icons[0];
  patentIcon.title = `Patente: Nível ${level} • Próximo: ${Math.ceil(pointsNeeded(level + 1))} pts`;
}

function updateStatsUI(id) {
  const stats = loadStats(id);
  const level = levelForPoints(stats.points);
  renderPatentIcon(level);
}

function awardPoints(amount, type = 'generic') {
  if (!currentPlayerId) return;
  const stats = loadStats(currentPlayerId);
  const prevLevel = levelForPoints(stats.points);
  stats.points = (stats.points || 0) + amount;
  if (type === 'pvp_win') stats.winsPvP = (stats.winsPvP || 0) + 1;
  if (type === 'solo_win') stats.winsSolo = (stats.winsSolo || 0) + 1;
  saveStats(currentPlayerId, stats);
  // persist to Firestore as well
  saveStatsToFirestore(currentPlayerId, stats).catch(() => {});
  const newLevel = levelForPoints(stats.points);
  updateStatsUI(currentPlayerId);
  if (newLevel > prevLevel) {
    setBattleStatus(`Subiu de patente! Agora Nível ${newLevel}`);
  }
}

// --- end scoring ---

function playLobbyAudio() {
  if (audioMuted) return;
  if (lobbyVideo) {
    lobbyVideo.muted = false;
    lobbyVideo.volume = 1;
    lobbyVideo.play().catch(() => {});
  }
}

function handleForfeit() {
  const confirmed = window.confirm('Deseja desistir desta partida? Isso concederá vitória por W.O. ao oponente.');
  if (!confirmed) {
    return;
  }

  if (isSoloMode) {
    setBattleStatus('Você desistiu. Vitória por W.O. do bot.');
    return;
  }

  socket.emit('forfeit_battle');
  setBattleStatus('Você desistiu. Vitória por W.O. concedida ao adversário.');
}

function pauseLobbyAudio() {
  if (lobbyVideo) {
    lobbyVideo.pause();
  }
}

function toggleLobbyAudio() {
  setAudioMuted(!audioMuted);
}

function openOptions() {
  optionsPanel?.classList.remove('hidden');
}

function closeOptions() {
  optionsPanel?.classList.add('hidden');
}

function logout() {
  signOut(auth).catch(() => {});
  setBattleStatus('Você saiu. Volte sempre.');
  loginScreen.classList.remove('hidden');
  loginScreen.classList.remove('visible');
  lobbyScreen.classList.add('hidden');
  lobbyScreen.classList.remove('visible');
  battleScreen.classList.add('hidden');
  battleScreen.classList.remove('visible');
  pauseLobbyAudio();
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
  battleScreen.classList.add('hidden');
  battleScreen.classList.remove('visible');
}

function showBattleScreen() {
  lobbyScreen.classList.add('hidden');
  lobbyScreen.classList.remove('visible');
  battleScreen.classList.remove('hidden');
  battleScreen.classList.add('visible');
  pauseLobbyAudio();
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

    const playerLabel = user.email || 'Capitão';
    playerName.textContent = playerLabel;
    fillPlayerHistory(playerLabel);
    currentPlayerId = user.uid || user.email || playerLabel;
    updateStatsUI(currentPlayerId);
    // load saved fleet if present in Firestore
    loadFleetFromFirestore(currentPlayerId).catch(() => {});
    // load stats from Firestore and merge
    loadStatsFromFirestore(currentPlayerId)
      .then((remoteStats) => {
        if (remoteStats) {
          saveStats(currentPlayerId, remoteStats);
          updateStatsUI(currentPlayerId);
        }
      })
      .catch(() => {});
    showLobbyScreen();
    playLobbyAudio();
    socket.emit('player_info', { name: playerLabel });
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

  // prevent duplicate shots on same coordinate
  if (cell.dataset.shot) {
    return;
  }

  // mark shot locally to block duplicate attempts while resolving
  cell.dataset.shot = 'true';

  canShoot = false;
  startReload();

  if (isSoloMode) {
    playShotSound();
    processPlayerShot(cell);
    return;
  }

  const cellId = cell.dataset.cell;
  playShotSound();
  socket.emit('fire_cannon', { cell: cellId });
}

// --- Fleet configuration modal and placement logic ---
const fleetModal = document.getElementById('fleet-modal');
const fleetInventory = document.getElementById('fleet-inventory');
const fleetGridEl = document.getElementById('fleet-grid');
const rotateShipBtn = document.getElementById('rotate-ship');
const flipShipBtn = document.getElementById('flip-ship');
const clearGridBtn = document.getElementById('clear-grid');
const randomizeGridBtn = document.getElementById('randomize-grid');
const saveFleetBtn = document.getElementById('save-fleet');
const closeFleetBtn = document.getElementById('close-fleet');

let fleetSaved = false;
let placingOrientation = 'horizontal'; // or 'vertical'
let placingDir = 1; // 1 forward, -1 reverse
let placement = null; // { grid: 10x10 null or shipId, ships: [{id,type,coords,orientation}] }

const fleetBlueprints = [
  {
    type: 'admiral',
    label: 'Navio Almirante',
    count: 1,
    pattern: [
      { row: 0, col: 1 },
      { row: 0, col: 3 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
    ],
  },
  {
    type: 'hospital',
    label: 'Navio Hospital',
    count: 1,
    pattern: [
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
    ],
  },
  {
    type: 'aircraft',
    label: 'Avião',
    count: 1,
    pattern: [
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
      { row: 2, col: 1 },
      { row: 3, col: 1 },
    ],
  },
  {
    type: 'destroyer',
    label: 'Destroyer',
    count: 2,
    pattern: [
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ],
  },
  {
    type: 'torpedo',
    label: 'Torpedoeiro',
    count: 3,
    pattern: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ],
  },
  {
    type: 'carrier',
    label: 'Porta-Aviões',
    count: 1,
    pattern: [
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
      { row: 2, col: 2 },
    ],
  },
  {
    type: 'submarine',
    label: 'Submarino',
    count: 4,
    pattern: [
      { row: 0, col: 0 },
    ],
  },
];

function getBlueprint(type) {
  return fleetBlueprints.find((bp) => bp.type === type);
}

function getShipLabel(ship) {
  const bp = getBlueprint(ship.type);
  return bp?.label || 'Navio';
}

function getShipShortLabel(ship) {
  const labels = {
    admiral: 'A',
    hospital: 'H',
    aircraft: 'V',
    destroyer: 'D',
    torpedo: 'T',
    carrier: 'P',
    submarine: 'S',
  };
  return labels[ship.type] || ship.id;
}

function normalizePattern(pattern) {
  const minRow = Math.min(...pattern.map((p) => p.row));
  const minCol = Math.min(...pattern.map((p) => p.col));
  return pattern.map((p) => ({ row: p.row - minRow, col: p.col - minCol }));
}

function orientedPattern(pattern, orientation, dir) {
  let coords = pattern.map(({ row, col }) => ({ row, col }));
  if (orientation === 'vertical') {
    coords = coords.map(({ row, col }) => ({ row: col, col: -row }));
  }
  if (dir === -1) {
    const maxCol = Math.max(...coords.map((c) => c.col));
    coords = coords.map(({ row, col }) => ({ row, col: maxCol - col }));
  }
  return normalizePattern(coords);
}

function initPlacement() {
  const grid = Array.from({ length: 10 }, () => Array(10).fill(null));
  const ships = [];

  fleetBlueprints.forEach((blueprint) => {
    const count = blueprint.count || 1;
    for (let i = 0; i < count; i += 1) {
      ships.push({ id: `s${ships.length}`, type: blueprint.type, coords: [], orientation: 'horizontal', dir: 1 });
    }
  });

  placement = { grid, ships };
}

function renderFleetGrid() {
  if (!fleetGridEl) return;
  fleetGridEl.innerHTML = '';
  for (let i = 1; i <= 100; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'fleet-cell';
    cell.dataset.cell = String(i);
    cell.addEventListener('dragover', (e) => e.preventDefault());
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      const shipId = e.dataTransfer.getData('text/plain');
      handlePlaceShipAtCell(shipId, cell.dataset.cell);
    });
    fleetGridEl.appendChild(cell);
  }
}

function renderInventory() {
  if (!fleetInventory) return;
  fleetInventory.innerHTML = '';
  placement.ships.forEach((ship) => {
    const label = getShipLabel(ship);
    const el = document.createElement('div');
    el.className = `fleet-ship fleet-ship-${ship.type}`;
    el.draggable = true;
    el.dataset.shipId = ship.id;
    el.innerHTML = `<strong>${label}</strong><span class="ship-size">${getBlueprint(ship.type)?.pattern.length || 0} peças</span>`;
    el.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', ship.id);
    });
    fleetInventory.appendChild(el);
  });
}
function canPlace(coords) {
  return coords.every(({ row, col }) => placement.grid[row][col] === null);
}

function rotateAndFlipPattern(pattern, orientation, dir) {
  let coords = pattern.map(({ row, col }) => ({ row, col }));
  if (orientation === 'vertical') {
    coords = coords.map(({ row, col }) => ({ row: col, col: -row }));
  }
  if (dir === -1) {
    coords = coords.map(({ row, col }) => ({ row, col: -col }));
  }
  const minRow = Math.min(...coords.map((c) => c.row));
  const minCol = Math.min(...coords.map((c) => c.col));
  return coords.map(({ row, col }) => ({ row: row - minRow, col: col - minCol }));
}

function coordsForPlacement(startCellId, ship, orientation, dir) {
  const blueprint = getBlueprint(ship.type);
  if (!blueprint) return null;
  const base = rotateAndFlipPattern(blueprint.pattern, orientation, dir);
  const { row, col } = cellIdToCoord(startCellId);
  const coords = base.map((cell) => ({ row: row + cell.row, col: col + cell.col }));
  if (coords.some(({ row: r, col: c }) => r < 0 || r >= 10 || c < 0 || c >= 10)) {
    return null;
  }
  return coords;
}

function placeShip(shipId, coords, orientation) {
  const ship = placement.ships.find((s) => s.id === shipId);
  if (!ship) return false;
  ship.coords.forEach(({ row, col }) => {
    placement.grid[row][col] = null;
  });
  ship.coords = coords;
  ship.orientation = orientation;
  coords.forEach(({ row, col }) => {
    placement.grid[row][col] = shipId;
  });
  renderPlacementToDOM();
  return true;
}

function renderPlacementToDOM() {
  const cells = fleetGridEl?.querySelectorAll('.fleet-cell') || [];
  cells.forEach((cell) => {
    const id = Number(cell.dataset.cell);
    const { row, col } = cellIdToCoord(id);
    const occupant = placement.grid[row][col];
    if (occupant) {
      const ship = placement.ships.find((s) => s.id === occupant);
      cell.classList.add('occupied');
      cell.textContent = ship ? getShipShortLabel(ship) : 'X';
    } else {
      cell.classList.remove('occupied');
      cell.textContent = '';
    }
  });
}

function handlePlaceShipAtCell(shipId, startCellId) {
  const ship = placement.ships.find((s) => s.id === shipId);
  if (!ship) return;
  const coords = coordsForPlacement(startCellId, ship, placingOrientation, placingDir);
  if (!coords) {
    displayError('Posição inválida (fora da grade)');
    return;
  }
  if (!canPlace(coords)) {
    displayError('Sobreposição detectada. Escolha outra posição.');
    return;
  }
  ship.coords = coords;
  ship.orientation = placingOrientation;
  ship.dir = placingDir;
  placeShip(shipId, coords, placingOrientation);
}

function clearPlacement() {
  placement.ships.forEach((s) => (s.coords = []));
  placement.grid.forEach((row) => row.fill(null));
  renderPlacementToDOM();
}

function randomizePlacement() {
  placement.grid.forEach((row) => row.fill(null));
  placement.ships.forEach((s) => {
    s.coords = [];
    s.orientation = 'horizontal';
    s.dir = 1;
  });

  const shipsToPlace = [...placement.ships].sort((a, b) => {
    return (getBlueprint(b.type)?.pattern.length || 0) - (getBlueprint(a.type)?.pattern.length || 0);
  });

  shipsToPlace.forEach((ship) => {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 400) {
      attempts += 1;
      const row = Math.floor(Math.random() * 10);
      const col = Math.floor(Math.random() * 10);
      const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
      const dir = Math.random() < 0.5 ? 1 : -1;
      const cellId = coordToCellId(row, col);
      const coords = coordsForPlacement(cellId, ship, orientation, dir);
      if (!coords || !canPlace(coords)) continue;
      ship.coords = coords;
      ship.orientation = orientation;
      ship.dir = dir;
      coords.forEach(({ row: r, col: c }) => {
        placement.grid[r][c] = ship.id;
      });
      placed = true;
    }
  });
  renderPlacementToDOM();
}

function buildPlayerFleetFromPlacement() {
  const grid = Array.from({ length: 10 }, () => Array(10).fill(null));
  const ships = [];
  placement.ships.forEach((s) => {
    const shipObj = { size: s.coords.length, type: s.type, coords: s.coords.slice(), hits: new Set() };
    ships.push(shipObj);
    s.coords.forEach(({ row, col }) => (grid[row][col] = shipObj));
  });
  return { grid, ships };
}

function openFleetModal() {
  if (!fleetModal) return;
  fleetModal.classList.remove('hidden');
  initPlacement();
  renderFleetGrid();
  renderInventory();
  renderPlacementToDOM();
}

function closeFleetModal() {
  if (!fleetModal) return;
  fleetModal.classList.add('hidden');
}

rotateShipBtn?.addEventListener('click', () => {
  placingOrientation = placingOrientation === 'horizontal' ? 'vertical' : 'horizontal';
});

flipShipBtn?.addEventListener('click', () => {
  placingDir = placingDir === 1 ? -1 : 1;
});

clearGridBtn?.addEventListener('click', () => {
  clearPlacement();
});

randomizeGridBtn?.addEventListener('click', () => {
  randomizePlacement();
});

saveFleetBtn?.addEventListener('click', () => {
  // validate all ships placed
  const allPlaced = placement.ships.every((s) => {
    const blueprint = getBlueprint(s.type);
    return s.coords && blueprint && s.coords.length === blueprint.pattern.length;
  });
  if (!allPlaced) {
    displayError('Você deve posicionar todos os navios antes de salvar.');
    return;
  }
  playerFleet = buildPlayerFleetFromPlacement();
  fleetSaved = true;
  if (fleetConfigStatus) fleetConfigStatus.textContent = 'Frota salva.';
  // persist to Firestore if possible
  if (currentPlayerId) {
    setDoc(doc(db, 'users', currentPlayerId), { fleet: placement.ships }, { merge: true })
      .catch(() => {
        displayError('Não foi possível salvar a frota remotamente. Salvando localmente.');
      })
      .finally(() => closeFleetModal());
  } else {
    closeFleetModal();
  }
});

closeFleetBtn?.addEventListener('click', () => closeFleetModal());

fleetConfigButton?.addEventListener('click', () => openFleetModal());

// --- Socket flow for PvP hits validation ---
socket.on('opponent_fire', ({ cell, shooterIndex }) => {
  // opponent fired at us; compute hit against our playerFleet
  const cellEl = board?.querySelector(`[data-cell="${cell}"]`);
  let hit = false;
  let sunk = false;
  let defeated = false;
  if (playerFleet) {
    const { hit: h, sunk: s } = applyShotToFleet(playerFleet, cell);
    hit = h; sunk = s;
    if (s && isFleetSunk(playerFleet)) {
      defeated = true;
    }
  }
  // mark our board for the opponent's shot
  if (cellEl) {
    cellEl.dataset.shot = 'true';
    cellEl.classList.add(hit ? 'board-cell-fleet-hit' : 'board-cell-shot');
  }
  // play enemy shot sound
  try { playEnemyShotSound(); } catch (e) {}
  socket.emit('fire_response', { cell, shooterIndex, hit, sunk, defeated });
});

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
  if (!fleetSaved) {
    // decline the match if fleet not saved
    socket.emit('decline_match');
    setBattleStatus('Partida recusada: salve sua frota antes de batalhar.');
    return;
  }
  showBattleScreen();
  setBattleStatus(turn ? 'Partida online iniciada. Sua vez.' : 'Partida online iniciada. Aguarde o turno do adversário.');
});

socket.on('shot_result', (payload) => {
  const { cell, shooterIndex, nextTurn, hit, sunk, defeated, winner } = payload;
  const targetCell = board?.querySelector(`[data-cell="${cell}"]`);
  const isShooter = playerIndex === shooterIndex;
  if (targetCell) {
    if (typeof hit !== 'undefined') {
      if (isShooter) {
        targetCell.classList.add(hit ? 'board-cell-fleet-hit' : 'board-cell-shot');
      } else {
        targetCell.classList.add(hit ? 'board-cell-fleet-hit' : 'board-cell-shot');
      }
      if (sunk) {
        setBattleStatus(isShooter ? 'Você afundou um navio!' : 'Seu navio foi afundado!');
      }
      if (defeated) {
        setBattleStatus(winner === playerIndex ? 'Você venceu a partida!' : 'Você perdeu a partida.');
      }
    } else {
      highlightCell(targetCell, isShooter ? 'board-cell-shot' : 'board-cell-fleet-hit');
    }
  }
  isPlayerTurn = playerIndex === nextTurn;
});

socket.on('battle_forfeit', ({ winner, loser }) => {
  if (playerIndex === winner) {
    setBattleStatus('Vitória por W.O.! Seu oponente desistiu.');
    // award PvP victory points (server-triggered W.O.)
    awardPoints(5, 'pvp_win');
  } else {
    setBattleStatus('Sua equipe perdeu por W.O..');
  }
  isPlayerTurn = false;
});

socket.on('waiting_for_opponent', () => {
  setBattleStatus('Aguardando oponente online...');
});

socket.on('online_players', (players) => {
  fillOnlinePlayers(players);
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
logoutButton?.addEventListener('click', logout);
toggleAudioButton?.addEventListener('click', toggleLobbyAudio);
optionsButton?.addEventListener('click', openOptions);
closeOptionsButton?.addEventListener('click', closeOptions);
forfeitButton?.addEventListener('click', handleForfeit);
fleetConfigButton?.addEventListener('click', () => {
  openFleetModal();
});
viewHistoryButton?.addEventListener('click', () => {
  fillPlayerHistory();
});

if (board) {
  board.addEventListener('mousemove', handleBoardPointerMove);
  board.addEventListener('click', handleBoardClick);
  board.addEventListener('touchstart', handleBoardTouchStart, { passive: false });
  board.addEventListener('touchmove', handleBoardTouchMove, { passive: false });
}

document.addEventListener('keydown', handleSpacebar);
resetAmmoDisplay();
