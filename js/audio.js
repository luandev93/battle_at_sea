import { dom } from './dom.js';
import { state } from './state.js';

let audioCtx = null;
let ambientGain = null;
let ambientNodes = null;

function initAudioContext() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

export function setAudioMuted(value) {
  state.audioMuted = Boolean(value);

  if (dom.toggleAudioButton) {
    dom.toggleAudioButton.textContent = state.audioMuted ? 'Som: Mudo' : 'Som: Ligado';
    dom.toggleAudioButton.classList.toggle('active', !state.audioMuted);
  }

  if (dom.loginVideo) {
    dom.loginVideo.muted = true;
    if (!state.audioMuted && state.currentScreen === 'lobby') {
      dom.loginVideo.play().catch(() => {});
    }
  }

  if (state.audioMuted) {
    stopAmbientSound();
  } else if (state.currentScreen === 'battle') {
    startAmbientSound();
  }
}

export function toggleAudioMuted() {
  setAudioMuted(!state.audioMuted);
}

// Low submarine hum that plays for the duration of a battle.
export function startAmbientSound() {
  if (state.audioMuted) return;
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

  ambientGain.gain.cancelScheduledValues(audioCtx.currentTime);
  ambientGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
  ambientGain.gain.linearRampToValueAtTime(0.16, audioCtx.currentTime + 1.2);
}

export function stopAmbientSound() {
  if (!audioCtx || !ambientGain) return;
  ambientGain.gain.cancelScheduledValues(audioCtx.currentTime);
  ambientGain.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + 0.8);

  setTimeout(() => {
    if (!ambientNodes) return;
    try {
      ambientNodes.osc1.stop();
      ambientNodes.osc2.stop();
    } catch (e) {
      // oscillators may already be stopped; safe to ignore
    }
    ambientNodes = null;
  }, 900);
}

export function playShotSound() {
  if (state.audioMuted) return;
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

  // short burst of noise for the impact
  const bufferSize = Math.floor(audioCtx.sampleRate * 0.06);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * Math.exp((-i / bufferSize) * 6);
  }
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

export function playEnemyShotSound() {
  if (state.audioMuted) return;
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

  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.4);
}

export function playLoginVideo() {
  if (state.audioMuted) return;
  if (dom.loginVideo) {
    dom.loginVideo.muted = true;
    dom.loginVideo.play().catch(() => {});
  }
}

export function pauseLoginVideo() {
  dom.loginVideo?.pause();
}
