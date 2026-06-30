import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleJoin = (e) => {
    e.preventDefault();
    const trimmed = roomName.trim();
    if (!trimmed) {
      setError('Enter a room name');
      return;
    }
    navigate(`/room/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Video chat</h1>
        <p style={styles.subtitle}>test task by Kulish Ksenia</p>
        <form onSubmit={handleJoin} style={styles.form}>
          <input
            type="text"
            placeholder="Enter room name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            style={styles.input}
          />
          <button type="submit" style={styles.button}>
            Join
          </button>
        </form>
        {error && <p style={styles.error}>{error}</p>}
        <p style={styles.footer}>
          No register, free enter up to 4 members
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#000',
    fontFamily: "'Inter', sans-serif",
    padding: '20px',
  },
  card: {
    background: 'linear-gradient(#000, #000) padding-box, radial-gradient(circle at 20% 30%, #FA37DA, #4C37FA) border-box',
    border: '2px solid transparent',
    borderRadius: '40px',
    padding: '48px 40px',
    maxWidth: '520px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 20px 40px rgba(250,55,218,0.25), 0 0 0 1px rgba(76,55,250,0.2)',
    boxSizing: 'border-box',
  },
  title: {
    fontSize: '42px',
    fontWeight: 800,
    background: 'radial-gradient(circle at 0% 50%, #FA37DA, #4C37FA)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
    marginBottom: '8px',
    letterSpacing: '-1px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#aaa',
    marginBottom: '32px',
    fontWeight: 400,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '24px',
  },
  input: {
    padding: '16px 20px',
    borderRadius: '60px',
    border: '1px solid rgba(250,55,218,0.4)',
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    fontSize: '16px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  button: {
    padding: '16px',
    borderRadius: '60px',
    border: 'none',
    background: 'linear-gradient(95deg, #FA37DA, #4C37FA)',
    color: '#fff',
    fontSize: '18px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    color: '#ff6b6b',
    fontSize: '14px',
    marginTop: '8px',
  },
  footer: {
    fontSize: '14px',
    color: '#888',
    marginTop: '16px',
  },
};

export default App;