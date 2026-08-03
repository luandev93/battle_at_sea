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
import { auth } from './firebase-config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { displayError, clearError, fillPlayerHistory, showLobbyScreen, showLoginScreen, setBattleStatus } from './ui.js';
import { playLobbyAudio } from './audio.js';
import { updateStatsUI, loadStatsFromFirestore, saveStats } from './stats.js';
import { loadFleetFromFirestore } from './placement.js';
import { emitPlayerInfo } from './network.js';

function getCredentials() {
  return {
    email: dom.emailInput.value.trim(),
    password: dom.passwordInput.value,
  };
}

function getPersistenceMode() {
  return dom.rememberMeCheckbox?.checked ? browserLocalPersistence : browserSessionPersistence;
}

export function togglePasswordVisibility() {
  if (!dom.passwordInput || !dom.togglePasswordButton) return;

  const isPassword = dom.passwordInput.type === 'password';
  dom.passwordInput.type = isPassword ? 'text' : 'password';
  dom.togglePasswordButton.textContent = isPassword ? 'Ocultar' : 'Mostrar';
  dom.togglePasswordButton.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
}

export function updateCapsLockWarning(event) {
  if (!dom.capsLockWarning) return;
  const isCapsLock = event.getModifierState && event.getModifierState('CapsLock');
  dom.capsLockWarning.hidden = !isCapsLock;
}

export async function handleSignIn() {
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
    if (dom.playerName) dom.playerName.textContent = playerLabel;
    fillPlayerHistory(playerLabel);

    state.currentPlayerId = user.uid || user.email || playerLabel;
    updateStatsUI(state.currentPlayerId);

    loadFleetFromFirestore(state.currentPlayerId).catch(() => {});
    loadStatsFromFirestore(state.currentPlayerId)
      .then((remoteStats) => {
        if (remoteStats) {
          saveStats(state.currentPlayerId, remoteStats);
          updateStatsUI(state.currentPlayerId);
        }
      })
      .catch(() => {});

    showLobbyScreen();
    playLobbyAudio();
    emitPlayerInfo(playerLabel);
  } catch (error) {
    displayError(error.message || 'Falha ao entrar. Verifique suas credenciais.');
  }
}

export async function handleSignUp() {
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

export async function handlePasswordReset() {
  clearError();
  const email = dom.emailInput.value.trim();

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

export function logout() {
  signOut(auth).catch(() => {});
  setBattleStatus('Você saiu. Volte sempre.');
  showLoginScreen();
}
