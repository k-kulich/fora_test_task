const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { generateRoomId, createRoom, getTokenForRoom, roomExists } = require('./rooms');
const { generateHostToken, generateGuestToken } = require('./livekit');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Создание комнаты (хост)
app.post('/api/rooms', async (req, res) => {
  try {
    const roomId = generateRoomId();
    const hostToken = generateHostToken(roomId);
    // Сохраняем комнату в памяти
    createRoom(roomId);
    const joinUrl = `${process.env.PUBLIC_URL}/room/${roomId}`;
    res.json({ roomId, hostToken, joinUrl });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Получение гостевого токена
app.get('/api/rooms/:roomId/token', (req, res) => {
  const { roomId } = req.params;
  if (!roomExists(roomId)) {
    return res.status(404).json({ error: 'Room not found' });
  }
  try {
    const guestToken = generateGuestToken(roomId);
    const wsUrl = process.env.LIVEKIT_WS_URL || 'ws://localhost:7880';
    res.json({ token: guestToken, wsUrl });
  } catch (error) {
    console.error('Error generating guest token:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Проверка существования комнаты (опционально)
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