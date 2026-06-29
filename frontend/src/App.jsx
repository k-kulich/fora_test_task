import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Room from './Room';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:roomId" element={<Room />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function Home() {
  const [roomName, setRoomName] = useState('');
  const [joinRoomName, setJoinRoomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Создание комнаты
  const createRoom = async (e) => {
    e.preventDefault();
    setError('');
    if (!roomName.trim()) {
      setError('Введите название комнаты');
      return;
    }
    setLoading(true);
    try {
      const body = { roomName: roomName.trim() };
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create room');
      }
      window.location.href = `/room/${data.roomId}`;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Присоединение к комнате
  const joinRoom = (e) => {
    e.preventDefault();
    setError('');
    if (!joinRoomName.trim()) {
      setError('Введите название комнаты для входа');
      return;
    }
    window.location.href = `/room/${joinRoomName.trim()}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h1>Видеозвонок</h1>
      <div style={{ marginBottom: '20px' }}>
        <form onSubmit={createRoom} style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder="Название комнаты"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            disabled={loading}
            style={{ padding: '8px', fontSize: '16px' }}
          />
          <button type="submit" disabled={loading} style={{ padding: '8px 20px', fontSize: '16px', cursor: 'pointer' }}>
            {loading ? 'Создание...' : 'Создать комнату'}
          </button>
        </form>
        <div style={{ fontSize: '14px', color: '#888', marginTop: '5px' }}>
          * Если оставить пустым, будет сгенерировано случайное имя
        </div>
      </div>
      <div>
        <form onSubmit={joinRoom} style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder="Введите название комнаты"
            value={joinRoomName}
            onChange={(e) => setJoinRoomName(e.target.value)}
            style={{ padding: '8px', fontSize: '16px' }}
          />
          <button type="submit" style={{ padding: '8px 20px', fontSize: '16px', cursor: 'pointer' }}>
            Присоединиться
          </button>
        </form>
      </div>
      {error && <p style={{ color: 'red', marginTop: '10px' }}>{error}</p>}
    </div>
  );
}

export default App;