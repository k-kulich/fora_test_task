const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const RoomManager = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.send('OK'));

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  let currentRoomId = null;
  let currentName = null;

  socket.on('join-room', ({ roomId, name }) => {
    const cleanName = name.trim().slice(0, 30).replace(/[^a-zA-Zа-яА-Я0-9 _-]/g, '');
    if (!cleanName) {
      socket.emit('error', { message: 'Invalid name' });
      return;
    }
    let room = RoomManager.getRoom(roomId);
    if (!room) {
      RoomManager.createRoom(roomId);
      room = RoomManager.getRoom(roomId);
    }
    const result = RoomManager.addParticipant(roomId, socket.id, cleanName);
    if (result.error === 'ROOM_FULL') {
      socket.emit('room-full', { message: 'Комната заполнена' });
      return;
    } else if (result.error) {
      socket.emit('error', { message: 'Unknown error' });
      return;
    }
    currentRoomId = roomId;
    currentName = cleanName;
    socket.join(roomId);

    const participants = RoomManager.getParticipants(roomId).map(p => ({
      socketId: p.socketId,
      name: p.name,
    }));
    const messages = RoomManager.getMessages(roomId);
    socket.emit('room-state', { participants, messages });
    socket.broadcast.to(roomId).emit('participant-joined', {
      socketId: socket.id,
      name: cleanName,
    });
    const sysMsg = RoomManager.addMessage(roomId, 'System', `${cleanName} присоединился`);
    io.to(roomId).emit('chat-message', sysMsg);
  });

  socket.on('signal', ({ roomId, targetSocketId, signalData }) => {
    if (!roomId || !targetSocketId || !signalData) return;
    const room = RoomManager.getRoom(roomId);
    if (!room) return;
    const target = room.participants.find(p => p.socketId === targetSocketId);
    if (!target) return;
    io.to(targetSocketId).emit('signal', {
      fromSocketId: socket.id,
      signalData,
    });
  });

  socket.on('chat-message', ({ roomId, text }) => {
    if (!roomId || !text.trim()) return;
    const room = RoomManager.getRoom(roomId);
    if (!room) return;
    const sender = room.participants.find(p => p.socketId === socket.id);
    if (!sender) return;
    const cleanText = text.trim().slice(0, 500);
    const msg = RoomManager.addMessage(roomId, sender.name, cleanText);
    if (msg) {
      io.to(roomId).emit('chat-message', msg);
    }
  });

  socket.on('leave-room', ({ roomId }) => {
    if (roomId && currentRoomId === roomId) {
      leaveRoom(socket, roomId);
    }
  });

  socket.on('disconnect', () => {
    if (currentRoomId) {
      leaveRoom(socket, currentRoomId);
    }
    console.log(`Socket disconnected: ${socket.id}`);
  });

  function leaveRoom(socket, roomId) {
    const removed = RoomManager.removeParticipant(roomId, socket.id);
    if (!removed) return;
    socket.broadcast.to(roomId).emit('participant-left', {
      socketId: socket.id,
      name: removed.name,
    });
    const sysMsg = RoomManager.addMessage(roomId, 'System', `${removed.name} покинул комнату`);
    if (sysMsg) {
      io.to(roomId).emit('chat-message', sysMsg);
    }
    socket.leave(roomId);
    currentRoomId = null;
    currentName = null;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});