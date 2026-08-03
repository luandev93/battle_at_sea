import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

// The single socket connection for the whole app. Incoming event
// listeners are wired up in main.js (the composition root) so this
// module stays a one-way dependency: everyone can import `socket`,
// but this file never has to import game logic.
export const socket = io();

export function emitFireCannon(cell) {
  socket.emit('fire_cannon', { cell });
}

export function emitFireResponse(payload) {
  socket.emit('fire_response', payload);
}

export function emitDeclineMatch() {
  socket.emit('decline_match');
}

export function emitForfeitBattle() {
  socket.emit('forfeit_battle');
}

export function emitPlayerInfo(name) {
  socket.emit('player_info', { name });
}
