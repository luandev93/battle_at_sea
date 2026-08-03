import { dom } from './dom.js';
import { state } from './state.js';
import { getTurnSeconds } from './matchConfig.js';

// Replaces the old reload countdown. That timer ran *after* you fired
// and blocked your next shot, which punished acting; this one bounds how
// long a turn may last, like a chess clock, and only exists if the room
// was created with a time control.

let onExpire = null;

export function setTurnExpiryHandler(fn) {
  onExpire = fn;
}

export function stopTurnClock() {
  if (state.turnClockInterval) {
    clearInterval(state.turnClockInterval);
    state.turnClockInterval = null;
  }
  if (dom.turnClockValue) {
    dom.turnClockValue.textContent = '∞';
  }
  if (dom.turnClock) {
    dom.turnClock.classList.remove('turn-clock-urgent');
  }
}

export function startTurnClock() {
  stopTurnClock();

  const total = getTurnSeconds();
  if (!total) {
    // "Sem limite" — show the infinity marker and never tick.
    if (dom.turnClockValue) dom.turnClockValue.textContent = '∞';
    return;
  }

  let remaining = total;
  const render = () => {
    if (dom.turnClockValue) dom.turnClockValue.textContent = `${remaining}s`;
    dom.turnClock?.classList.toggle('turn-clock-urgent', remaining <= 5);
  };
  render();

  state.turnClockInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      stopTurnClock();
      if (typeof onExpire === 'function') onExpire();
      return;
    }
    render();
  }, 1000);
}
