import {
  onAuthStateChanged,
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

const REMEMBER_KEY = 'battleAtSea.remember';

// Firebase persists an auth *token*, never the password itself. Keeping
// the email and the checkbox state locally just saves the player from
// retyping it; the credential itself is only ever held by Firebase.
function saveRememberPreference(email) {
  try {
    if (dom.rememberMeCheckbox?.checked) {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ remember: true, email }));
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
  } catch (e) {
    // private mode or storage disabled: not worth interrupting login
  }
}

export function restoreRememberPreference() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (dom.rememberMeCheckbox) dom.rememberMeCheckbox.checked = Boolean(saved.remember);
    if (dom.emailInput && saved.email) dom.emailInput.value = saved.email;
  } catch (e) {
    // ignore malformed storage
  }
}

// Everything that has to happen once a user is known to be signed in,
// whether they just typed their password or the session was restored.
function enterLobbyAsUser(user) {
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
  emitPlayerInfo(playerLabel);
}

// Without this the persisted session was never read back: the app always
// opened on the login screen, so "lembrar" had no visible effect.
export function watchAuthState() {
  // Only auto-enter when the player actually asked to be remembered.
  // Restoring any lingering session made the app jump to the lobby a
  // second after load — right as someone was tapping the email field.
  let remembered = false;
  try {
    remembered = Boolean(JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null')?.remember);
  } catch (e) {
    remembered = false;
  }
  if (!remembered) return;

  onAuthStateChanged(auth, (user) => {
    // Never yank someone out of a form they are already filling in.
    if (state.currentScreen !== 'login') return;
    if (document.activeElement === dom.emailInput || document.activeElement === dom.passwordInput) return;
    if (user && user.emailVerified) enterLobbyAsUser(user);
  });
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

    saveRememberPreference(user.email || email);
    enterLobbyAsUser(user);
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
  // An explicit logout should not be undone by the restore listener on
  // the next visit, so drop the remembered preference too.
  try {
    localStorage.removeItem(REMEMBER_KEY);
  } catch (e) {
    // storage unavailable; signOut below is what actually ends the session
  }
  if (dom.rememberMeCheckbox) dom.rememberMeCheckbox.checked = false;

  signOut(auth).catch(() => {});
  setBattleStatus('Você saiu. Volte sempre.');
  showLoginScreen();
}
