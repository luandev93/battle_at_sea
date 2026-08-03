import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase-config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { setBattleStatus } from './ui.js';

const PATENT_ICONS = ['🔰', '⚓', '🛳️', '🚢', '🦅', '🏅', '🏴‍☠️'];

export function pointsNeeded(n) {
  return 33 * Math.pow(n, 1.5);
}

export function levelForPoints(points) {
  let level = 0;
  for (let n = 1; n < 1000; n += 1) {
    if (points >= pointsNeeded(n)) {
      level = n;
    } else {
      break;
    }
  }
  return level;
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

export function renderPatentIcon(level) {
  if (!dom.patentIcon) return;
  const idx = Math.min(level, PATENT_ICONS.length - 1);
  dom.patentIcon.textContent = PATENT_ICONS[idx] || PATENT_ICONS[0];
  dom.patentIcon.title = `Patente: Nível ${level} • Próximo: ${Math.ceil(pointsNeeded(level + 1))} pts`;
}

export function updateStatsUI(id) {
  const stats = loadStats(id);
  renderPatentIcon(levelForPoints(stats.points));
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
    setBattleStatus(`Subiu de patente! Agora Nível ${newLevel}`);
  }
}
