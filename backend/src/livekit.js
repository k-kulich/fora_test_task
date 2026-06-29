const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;

if (!API_KEY || !API_SECRET) {
  console.error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set');
  process.exit(1);
}

function generateToken(roomId, name) {
  const identity = `${name}-${Date.now()}`;
  const payload = {
    iss: API_KEY,
    exp: Math.floor(Date.now() / 1000) + 3600,
    nbf: Math.floor(Date.now() / 1000) - 10,
    sub: identity,
    name: name,
    video: {
      room: roomId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    },
  };
  return jwt.sign(payload, API_SECRET, { algorithm: 'HS256' });
}

module.exports = { generateToken };