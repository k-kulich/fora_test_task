const { nanoid } = require('nanoid');

// In-memory store: roomId -> { createdAt, participants? }
const rooms = new Map();

function generateRoomId() {
  return nanoid(10); // например "abc123xyz"
}

function createRoom(roomId) {
  rooms.set(roomId, { createdAt: Date.now() });
  return roomId;
}

function roomExists(roomId) {
  return rooms.has(roomId);
}

function deleteRoom(roomId) {
  rooms.delete(roomId);
}

module.exports = {
  generateRoomId,
  createRoom,
  roomExists,
  deleteRoom,
};