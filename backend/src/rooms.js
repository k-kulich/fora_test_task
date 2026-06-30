const rooms = new Map();

class RoomManager {
  createRoom(roomId) {
    if (rooms.has(roomId)) return;
    rooms.set(roomId, {
      id: roomId,
      participants: [],
      messages: [],
      createdAt: Date.now(),
    });
  }

  getRoom(roomId) {
    return rooms.get(roomId) || null;
  }

  addParticipant(roomId, socketId, name) {
    const room = this.getRoom(roomId);
    if (!room) return { error: 'ROOM_NOT_FOUND' };
    if (room.participants.length >= 4) {
      return { error: 'ROOM_FULL' };
    }
    if (room.participants.some(p => p.socketId === socketId)) {
      return { error: 'ALREADY_IN_ROOM' };
    }
    room.participants.push({ socketId, name, joinedAt: Date.now() });
    return { success: true, room };
  }

  removeParticipant(roomId, socketId) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    const idx = room.participants.findIndex(p => p.socketId === socketId);
    if (idx === -1) return null;
    const removed = room.participants.splice(idx, 1)[0];
    if (room.participants.length === 0) {
      rooms.delete(roomId);
    }
    return removed;
  }

  getParticipants(roomId) {
    const room = this.getRoom(roomId);
    return room ? room.participants : [];
  }

  addMessage(roomId, senderName, text) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    const message = { senderName, text, timestamp: Date.now() };
    room.messages.push(message);
    return message;
  }

  getMessages(roomId) {
    const room = this.getRoom(roomId);
    return room ? room.messages : [];
  }
}

module.exports = new RoomManager();