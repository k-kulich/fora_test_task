import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

export const useSocket = (roomId, userName, onStateUpdate, shouldConnect) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!shouldConnect || !roomId || !userName) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const s = io('http://localhost:3000');
    socketRef.current = s;
    setSocket(s);

    s.on('connect', () => {
      setIsConnected(true);
      setError(null);
      s.emit('join-room', { roomId, name: userName });
    });

    s.on('connect_error', (err) => {
      setIsConnected(false);
      setError('Ошибка подключения к серверу');
      console.error(err);
    });

    s.on('error', (data) => {
      setError(data.message);
      if (onStateUpdate) onStateUpdate('error', data);
    });

    s.on('room-full', (data) => {
      setError('Room full');
      if (onStateUpdate) onStateUpdate('room-full', data);
    });

    s.on('room-state', (data) => {
      if (onStateUpdate) onStateUpdate('state', data);
    });

    s.on('participant-joined', (data) => {
      if (onStateUpdate) onStateUpdate('joined', data);
    });

    s.on('participant-left', (data) => {
      if (onStateUpdate) onStateUpdate('left', data);
    });

    s.on('signal', (data) => {
      if (onStateUpdate) onStateUpdate('signal', data);
    });

    s.on('chat-message', (data) => {
      if (onStateUpdate) onStateUpdate('chat', data);
    });

    return () => {
      if (s) {
        s.emit('leave-room', { roomId });
        s.disconnect();
      }
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    };
  }, [shouldConnect, roomId, userName, onStateUpdate]);

  return { socket, isConnected, error };
};