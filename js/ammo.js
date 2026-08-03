import { dom } from './dom.js';
import { state } from './state.js';

const RELOAD_SECONDS = 2.1;
const TICK_MS = 100;

export function resetAmmoDisplay() {
  if (dom.ammoValue) {
    dom.ammoValue.textContent = 'Ready';
  }
}

export function startReload() {
  let remaining = RELOAD_SECONDS;
  if (dom.ammoValue) {
    dom.ammoValue.textContent = remaining.toFixed(1);
  }

  state.reloadInterval = setInterval(() => {
    remaining -= TICK_MS / 1000;

    if (remaining <= 0) {
      clearInterval(state.reloadInterval);
      state.reloadInterval = null;
      state.canShoot = true;
      resetAmmoDisplay();
      return;
    }

    if (dom.ammoValue) {
      dom.ammoValue.textContent = remaining.toFixed(1);
    }
  }, TICK_MS);
}

export function cancelReload() {
  if (state.reloadInterval) {
    clearInterval(state.reloadInterval);
    state.reloadInterval = null;
  }
  state.canShoot = true;
  resetAmmoDisplay();
}
