const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Players waiting for an opponent. Matchmaking is explicit: connecting
// no longer pairs you with a stranger. Previously a socket was matched
// the instant the page loaded, before the player had a fleet, so the
// client immediately declined and PvP could never actually start.
// A single waiting slot meant a second player queueing simply evicted
// the first, who then waited forever. This is a real queue, and players
// are only paired with someone who chose the same map.
const queue = [];
const rooms = new Map();
const connectedPlayers = new Map();

function broadcastPlayers() {
  io.emit(
    'online_players',
    Array.from(connectedPlayers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
    }))
  );
}

function setStatus(socketId, status) {
  const player = connectedPlayers.get(socketId);
  if (player) {
    player.status = status;
    broadcastPlayers();
  }
}

function leaveQueue(socket) {
  const i = queue.findIndex((s) => s.id === socket.id);
  if (i !== -1) queue.splice(i, 1);
}

function mapOf(socket) {
  return socket.data.pendingConfig?.map || 'padrao';
}

function createMatchRoom(a, b, config) {
  const roomId = `room-${a.id}-${b.id}`;
  a.join(roomId);
  b.join(roomId);

  a.data.roomId = roomId;
  b.data.roomId = roomId;
  a.data.playerIndex = 1;
  b.data.playerIndex = 2;

  rooms.set(roomId, { players: [a.id, b.id], currentTurn: 1, config });

  const nameOf = (s) => connectedPlayers.get(s.id)?.name || 'Adversário';

  // Both clients must play by the same rules and on the same board, so
  // the room config travels with the match instead of each side using
  // whatever it had selected locally.
  a.emit('match_found', { playerIndex: 1, isPlayerTurn: true, config, opponent: nameOf(b) });
  b.emit('match_found', { playerIndex: 2, isPlayerTurn: false, config, opponent: nameOf(a) });

  setStatus(a.id, 'Em combate');
  setStatus(b.id, 'Em combate');
  console.log(`Match created: ${roomId}`);
}

function closeRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.players.forEach((id) => {
    const s = io.sockets.sockets.get(id);
    if (s) {
      s.leave(roomId);
      s.data.roomId = null;
      s.data.playerIndex = null;
      setStatus(id, 'No lobby');
    }
  });
  rooms.delete(roomId);
}

io.on('connection', (socket) => {
  connectedPlayers.set(socket.id, { id: socket.id, name: 'Jogador', status: 'No lobby' });
  // The client needs its own id to know which row in the player list is
  // itself, and to address challenges.
  socket.emit('your_id', { id: socket.id });
  broadcastPlayers();

  socket.on('player_info', ({ name }) => {
    const player = connectedPlayers.get(socket.id);
    if (player) player.name = name || 'Jogador';
    broadcastPlayers();
  });

  // Explicit matchmaking, triggered by the player pressing "Procurar".
  socket.on('find_match', ({ config } = {}) => {
    if (socket.data.roomId) return;
    const map = config?.map || 'padrao';

    // Fleets are laid out for one board size, so two players can only
    // meet if they queued for the same map. Pairing across maps handed
    // one of them a fleet whose coordinates no longer existed.
    leaveQueue(socket);
    socket.data.pendingConfig = config || {};

    const idx = queue.findIndex((s) => s.connected && s.id !== socket.id && mapOf(s) === map);
    if (idx !== -1) {
      const [opponent] = queue.splice(idx, 1);
      createMatchRoom(opponent, socket, opponent.data.pendingConfig || config || {});
      return;
    }

    queue.push(socket);
    setStatus(socket.id, 'Procurando partida');
    socket.emit('waiting_for_opponent');
  });

  socket.on('cancel_match', () => {
    leaveQueue(socket);
    setStatus(socket.id, 'No lobby');
    socket.emit('match_cancelled');
  });

  // --- Direct challenges -------------------------------------------
  socket.on('challenge_player', ({ targetId, config } = {}) => {
    const target = io.sockets.sockets.get(targetId);
    if (!target || target.data.roomId || socket.data.roomId) {
      socket.emit('challenge_failed', { reason: 'Jogador indisponível no momento.' });
      return;
    }

    socket.data.pendingConfig = config || {};
    target.emit('challenge_received', {
      fromId: socket.id,
      fromName: connectedPlayers.get(socket.id)?.name || 'Jogador',
    });
    socket.emit('challenge_sent', { toName: connectedPlayers.get(targetId)?.name || 'Jogador' });
    setStatus(socket.id, 'Desafiando');
  });

  socket.on('accept_challenge', ({ fromId, config } = {}) => {
    const challenger = io.sockets.sockets.get(fromId);
    if (!challenger || challenger.data.roomId || socket.data.roomId) {
      socket.emit('challenge_failed', { reason: 'O desafio expirou.' });
      return;
    }

    const theirMap = challenger.data.pendingConfig?.map || 'padrao';
    const myMap = config?.map || 'padrao';
    if (theirMap !== myMap) {
      socket.emit('challenge_failed', {
        reason: `O desafiante joga no mapa "${theirMap}" e sua frota é do mapa "${myMap}". Reconfigure a frota nesse mapa para aceitar.`,
      });
      challenger.emit('challenge_declined', { byName: connectedPlayers.get(socket.id)?.name || 'Jogador' });
      setStatus(fromId, 'No lobby');
      return;
    }
    leaveQueue(challenger);
    leaveQueue(socket);
    // The challenger's room settings apply.
    createMatchRoom(challenger, socket, challenger.data.pendingConfig || {});
  });

  socket.on('decline_challenge', ({ fromId } = {}) => {
    const challenger = io.sockets.sockets.get(fromId);
    if (challenger) {
      challenger.emit('challenge_declined', {
        byName: connectedPlayers.get(socket.id)?.name || 'Jogador',
      });
      setStatus(fromId, 'No lobby');
    }
  });

  socket.on('fire_cannon', ({ cell }) => {
    const { roomId, playerIndex } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    if (room.currentTurn !== playerIndex) return;

    socket.to(roomId).emit('opponent_fire', { cell, shooterIndex: playerIndex });
  });

  socket.on('fire_response', ({ cell, shooterIndex, hit, sunk, defeated, sunkCells, autoWater }) => {
    const { roomId } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    if (defeated) {
      io.in(roomId).emit('shot_result', {
        cell, shooterIndex, nextTurn: shooterIndex, hit, sunk, defeated: true, winner: shooterIndex,
        sunkCells, autoWater,
      });
      closeRoom(roomId);
      return;
    }

    // Honour the room's turn rule: with "encadeado" a hit keeps the
    // turn, so the server must agree with the clients or the two sides
    // disagree about whose turn it is.
    const chains = room.config?.turnRule !== 'alternado';
    const nextTurn = hit && chains ? shooterIndex : shooterIndex === 1 ? 2 : 1;
    room.currentTurn = nextTurn;

    io.in(roomId).emit('shot_result', { cell, shooterIndex, nextTurn, hit, sunk, defeated: false, sunkCells, autoWater });
  });

  socket.on('forfeit_battle', () => {
    const { roomId, playerIndex } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;
    const winner = playerIndex === 1 ? 2 : 1;
    io.in(roomId).emit('battle_forfeit', { winner, loser: playerIndex });
    closeRoom(roomId);
  });

  socket.on('disconnect', () => {
    connectedPlayers.delete(socket.id);
    leaveQueue(socket);

    const { roomId } = socket.data;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.players
        .filter((id) => id !== socket.id)
        .forEach((id) => io.to(id).emit('opponent_left'));
      closeRoom(roomId);
    }
    broadcastPlayers();
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
