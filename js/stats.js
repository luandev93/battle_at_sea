import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase-config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { setBattleStatus } from './ui.js';

// Named ranks with hand-set thresholds. The old curve needed 33 solo
// wins just to leave the starting rank, so a new player saw no progress
// at all in their first sessions. The early steps are now quick and the
// later ones stretch out.
export const RANKS = [
  { name: 'Recruta', icon: '🔰', points: 0 },
  { name: 'Marinheiro', icon: '⚓', points: 6 },
  { name: 'Cabo', icon: '🛟', points: 18 },
  { name: 'Sargento', icon: '🚤', points: 36 },
  { name: 'Tenente', icon: '🛳️', points: 64 },
  { name: 'Capitão', icon: '🚢', points: 100 },
  { name: 'Comodoro', icon: '🦅', points: 150 },
  { name: 'Contra-Almirante', icon: '🏅', points: 220 },
  { name: 'Vice-Almirante', icon: '🎖️', points: 320 },
  { name: 'Almirante', icon: '🏴‍☠️', points: 450 },
];

export function levelForPoints(points = 0) {
  let level = 0;
  RANKS.forEach((rank, i) => {
    if (points >= rank.points) level = i;
  });
  return level;
}

export function rankForPoints(points = 0) {
  return RANKS[levelForPoints(points)];
}

// Points still needed for the next rank, or null at the top.
export function pointsNeeded(points = 0) {
  const next = RANKS[levelForPoints(points) + 1];
  return next ? next.points - points : null;
}

export function loadStats(id) {
  if (!id) return { points: 0, winsPvP: 0, winsSolo: 0 };
  try {
    const raw = localStorage.getItem(`bas:stats:${id}`);
    return raw ? JSON.parse(raw) : { points: 0, winsPvP: 0, winsSolo: 0 };
  } catch (e) {
    return { points: 0, winsPvP: 0, winsSolo: 0 };
  }
}

export function saveStats(id, stats) {
  if (!id) return;
  localStorage.setItem(`bas:stats:${id}`, JSON.stringify(stats));
}

export async function saveStatsToFirestore(id, stats) {
  if (!id) return;
  try {
    await setDoc(doc(db, 'users', id), { stats }, { merge: true });
  } catch (e) {
    console.warn('Não foi possível salvar estatísticas no Firestore', e);
  }
}

export async function loadStatsFromFirestore(id) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'users', id));
    if (!snap.exists()) return null;
    return snap.data().stats || null;
  } catch (e) {
    console.warn('Erro ao carregar estatísticas', e);
    return null;
  }
}

export function renderPatentIcon(points = 0) {
  const rank = rankForPoints(points);
  const missing = pointsNeeded(points);

  if (dom.patentIcon) {
    dom.patentIcon.textContent = rank.icon;
    dom.patentIcon.title = missing
      ? `${rank.name} • ${points} pts • faltam ${missing} para a próxima patente`
      : `${rank.name} • patente máxima`;
  }
  if (dom.patentName) {
    dom.patentName.textContent = rank.name;
  }
  if (dom.patentProgress) {
    dom.patentProgress.textContent = missing ? `${points} pts · faltam ${missing}` : `${points} pts · máximo`;
  }
}

export function updateStatsUI(id) {
  const stats = loadStats(id);
  renderPatentIcon(stats.points || 0);
}

export function awardPoints(amount, type = 'generic') {
  if (!state.currentPlayerId) return;

  const stats = loadStats(state.currentPlayerId);
  const prevLevel = levelForPoints(stats.points);

  stats.points = (stats.points || 0) + amount;
  if (type === 'pvp_win') stats.winsPvP = (stats.winsPvP || 0) + 1;
  if (type === 'solo_win') stats.winsSolo = (stats.winsSolo || 0) + 1;

  saveStats(state.currentPlayerId, stats);
  saveStatsToFirestore(state.currentPlayerId, stats).catch(() => {});

  const newLevel = levelForPoints(stats.points);
  updateStatsUI(state.currentPlayerId);

  if (newLevel > prevLevel) {
    setBattleStatus(`Promovido a ${RANKS[newLevel].name}!`);
  }
}
