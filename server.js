const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

let waitingSocket = null;
const rooms = new Map();

function createMatchRoom(firstSocket, secondSocket) {
  const roomId = `room-${firstSocket.id}-${secondSocket.id}`;
  firstSocket.join(roomId);
  secondSocket.join(roomId);

  firstSocket.data.roomId = roomId;
  secondSocket.data.roomId = roomId;
  firstSocket.data.playerIndex = 1;
  secondSocket.data.playerIndex = 2;

  rooms.set(roomId, {
    players: [firstSocket.id, secondSocket.id],
    currentTurn: 1,
  });

  firstSocket.emit('match_found', { playerIndex: 1, isPlayerTurn: true });
  secondSocket.emit('match_found', { playerIndex: 2, isPlayerTurn: false });
  console.log(`Match found in room ${roomId}`);
}

const connectedPlayers = new Map();

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  connectedPlayers.set(socket.id, { id: socket.id, name: 'Jogador' });
  io.emit('online_players', Array.from(connectedPlayers.values()).map((player) => player.name));

  if (waitingSocket && waitingSocket.connected) {
    createMatchRoom(waitingSocket, socket);
    waitingSocket = null;
  } else {
    waitingSocket = socket;
    socket.emit('waiting_for_opponent');
    console.log(`Socket waiting: ${socket.id}`);
  }

  socket.on('fire_cannon', ({ cell }) => {
    const { roomId, playerIndex } = socket.data;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const room = rooms.get(roomId);
    if (room.currentTurn !== playerIndex) {
      return;
    }

    // forward the fire to the opponent to validate hit/sunk locally
    socket.to(roomId).emit('opponent_fire', { cell, shooterIndex: playerIndex });
  });

  socket.on('fire_response', ({ cell, shooterIndex, hit, sunk, defeated }) => {
    const { roomId, playerIndex } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    // advance turn
    const nextTurn = room.currentTurn === 1 ? 2 : 1;
    room.currentTurn = nextTurn;

    // determine winner if defeated
    let winner = null;
    if (defeated) {
      winner = shooterIndex;
      // close room
      io.in(roomId).emit('shot_result', { cell, shooterIndex, nextTurn, hit, sunk, defeated: true, winner });
      rooms.delete(roomId);
      return;
    }

    io.in(roomId).emit('shot_result', { cell, shooterIndex, nextTurn, hit, sunk, defeated: false });
  });

  socket.on('decline_match', () => {
    const { roomId } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    // notify both
    io.in(roomId).emit('match_declined');
    // requeue remaining sockets: pick first other socket as waiting
    const other = room.players.find((id) => id !== socket.id);
    rooms.delete(roomId);
    if (other && io.sockets.sockets.get(other)) {
      waitingSocket = io.sockets.sockets.get(other);
      waitingSocket.emit('waiting_for_opponent');
    }
  });

  socket.on('player_info', ({ name }) => {
    const playerName = name || 'Jogador';
    connectedPlayers.set(socket.id, { id: socket.id, name: playerName });
    io.emit('online_players', Array.from(connectedPlayers.values()).map((player) => player.name));
  });

  socket.on('forfeit_battle', () => {
    const { roomId, playerIndex } = socket.data;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const room = rooms.get(roomId);
    const loser = playerIndex;
    const winner = loser === 1 ? 2 : 1;
    io.in(roomId).emit('battle_forfeit', { winner, loser });
    rooms.delete(roomId);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    connectedPlayers.delete(socket.id);
    io.emit('online_players', Array.from(connectedPlayers.values()).map((player) => player.name));

    if (waitingSocket === socket) {
      waitingSocket = null;
    }

    const { roomId } = socket.data;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.players = room.players.filter((id) => id !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else {
        const remainingSocketId = room.players[0];
        io.to(remainingSocketId).emit('opponent_left');
        rooms.delete(roomId);
      }
    }
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
