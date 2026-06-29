const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { generateRoomId, createRoom, roomExists, deleteRoom } = require('./rooms');
const { generateToken } = require('./livekit');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Создание комнаты (без токена)
app.post('/api/rooms', async (req, res) => {
  try {
    let { roomName } = req.body;
    let roomId;
    if (roomName) {
      if (!/^[a-zA-Z0-9_-]+$/.test(roomName)) {
        return res.status(400).json({ error: 'Invalid room name' });
      }
      roomId = roomName;
      if (roomExists(roomId)) {
        return res.status(409).json({ error: 'Room already exists' });
      }
      createRoom(roomId);
    } else {
      roomId = generateRoomId();
      createRoom(roomId);
    }
    const joinUrl = `${process.env.PUBLIC_URL}/room/${roomId}`;
    res.json({ roomId, joinUrl });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Получение токена (с именем)
app.get('/api/rooms/:roomId/token', (req, res) => {
  const { roomId } = req.params;
  const name = req.query.name || 'User';
  if (!roomExists(roomId)) {
    return res.status(404).json({ error: 'Room not found' });
  }
  try {
    const token = generateToken(roomId, name);
    const wsUrl = process.env.LIVEKIT_WS_URL || 'ws://localhost:7880';
    res.json({ token, wsUrl });
  } catch (error) {
    console.error('Error generating token:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Проверка существования комнаты
app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  if (roomExists(roomId)) {
    res.json({ exists: true });
  } else {
    res.status(404).json({ exists: false });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});