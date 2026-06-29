const { nanoid } = require('nanoid');

const rooms = new Map();

function generateRoomId() {
  return nanoid(10);
}

function createRoom(roomId) {
  if (rooms.has(roomId)) {
    throw new Error('Room already exists');
  }
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