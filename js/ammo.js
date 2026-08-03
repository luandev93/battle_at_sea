import { dom } from './dom.js';
import { state } from './state.js';

const RELOAD_SECONDS = 2.1;
const TICK_MS = 100;

export function resetAmmoDisplay() {
  if (dom.ammoValue) {
    dom.ammoValue.textContent = 'Pronto';
  }
}

export function startReload() {
  // A reload from a previous shot (or a previous match) may still be
  // ticking. Without clearing it first the old interval keeps writing to
  // the same display and will flip canShoot back on early.
  if (state.reloadInterval) {
    clearInterval(state.reloadInterval);
    state.reloadInterval = null;
  }

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
