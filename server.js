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

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

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

    const nextTurn = room.currentTurn === 1 ? 2 : 1;
    room.currentTurn = nextTurn;

    io.in(roomId).emit('shot_result', {
      cell,
      shooterIndex: playerIndex,
      nextTurn,
    });
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);

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
