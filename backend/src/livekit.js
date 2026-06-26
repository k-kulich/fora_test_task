const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;

if (!API_KEY || !API_SECRET) {
  console.error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set');
  process.exit(1);
}

function generateHostToken(roomId) {
  const payload = {
    iss: API_KEY,                                    // issuer = API Key
    exp: Math.floor(Date.now() / 1000) + 3600,       // срок действия 1 час
    nbf: Math.floor(Date.now() / 1000) - 10,         // начинает действовать на 10 секунд раньше
    sub: `host-${Date.now()}`,                       // уникальный идентификатор участника
    name: 'Host',
    video: {
      room: roomId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    },
  };
  return jwt.sign(payload, API_SECRET, { algorithm: 'HS256' });
}

function generateGuestToken(roomId) {
  const payload = {
    iss: API_KEY,
    exp: Math.floor(Date.now() / 1000) + 3600,
    nbf: Math.floor(Date.now() / 1000) - 10,
    sub: `guest-${Date.now()}`,
    name: 'Guest',
    video: {
      room: roomId,
      roomJoin: true,
      canPublish: true,      // разрешаем публиковать (камера/микрофон)
      canSubscribe: true,
    },
  };
  return jwt.sign(payload, API_SECRET, { algorithm: 'HS256' });
}

module.exports = {
  generateHostToken,
  generateGuestToken,
};