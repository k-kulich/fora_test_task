import React from 'react';
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
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const createRoom = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/rooms`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to create room');
      }
      const data = await response.json();
      window.location.href = `/room/${data.roomId}`;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h1>Видеозвонок</h1>
      <button onClick={createRoom} disabled={loading} style={{ padding: '12px 24px', fontSize: '18px', cursor: 'pointer' }}>
        {loading ? 'Создание...' : 'Создать звонок'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <p style={{ marginTop: '20px', color: '#aaa' }}>
        Поделитесь ссылкой с участниками
      </p>
    </div>
  );
}

export default App;