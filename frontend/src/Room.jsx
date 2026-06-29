import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Room, RoomEvent, Track } from 'livekit-client';

const RoomPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [token, setToken] = useState(null);
  const [wsUrl, setWsUrl] = useState(null);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);

  const roomRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteElements = useRef({});

  // Получение токена
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/rooms/${roomId}/token`
        );
        if (!response.ok) throw new Error('Комната не найдена или неактивна');
        const data = await response.json();
        setToken(data.token);
        setWsUrl(data.wsUrl || 'ws://localhost:7880');
      } catch (err) {
        setError(err.message);
      }
    };
    fetchToken();
  }, [roomId]);

  // Подключение к комнате
  useEffect(() => {
    // Если уже есть комната, не создаём новую
    if (roomRef.current) {
      console.log('Room already exists, skipping connect');
      return;
    }

    if (!token || !wsUrl) return;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 640, height: 480 },
      },
    });

    // Сохраняем ссылку до подключения, чтобы блокировать повторные вызовы
    roomRef.current = room;

    // События
    room.on(RoomEvent.ParticipantConnected, (participant) => {
      setParticipants((prev) => [...prev, participant]);
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      setParticipants((prev) => prev.filter((p) => p.sid !== participant.sid));
      const el = remoteElements.current[participant.sid];
      if (el) {
        if (el.videoWrapper) el.videoWrapper.remove();
        if (el.audioEl) el.audioEl.remove();
        delete remoteElements.current[participant.sid];
      }
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (participant.isLocal) return;
      const sid = participant.sid;
      if (!remoteElements.current[sid]) {
        remoteElements.current[sid] = {};
      }

      if (track.kind === 'video') {
        const container = document.getElementById('video-grid');
        if (!container) return;
        let wrapper = remoteElements.current[sid].videoWrapper;
        if (!wrapper) {
          wrapper = document.createElement('div');
          wrapper.style.position = 'relative';
          wrapper.style.margin = '8px';
          wrapper.dataset.participantId = sid;
          const vid = document.createElement('video');
          vid.autoplay = true;
          vid.playsInline = true;
          vid.style.width = '200px';
          vid.style.height = '150px';
          vid.style.background = '#333';
          vid.style.borderRadius = '8px';
          const label = document.createElement('span');
          label.style.position = 'absolute';
          label.style.bottom = '4px';
          label.style.left = '8px';
          label.style.color = '#fff';
          label.style.fontSize = '12px';
          label.textContent = participant.identity || 'Участник';
          wrapper.appendChild(vid);
          wrapper.appendChild(label);
          container.appendChild(wrapper);
          remoteElements.current[sid].videoWrapper = wrapper;
          remoteElements.current[sid].videoEl = vid;
        }
        track.attach(remoteElements.current[sid].videoEl);
      } else if (track.kind === 'audio') {
        let audioEl = remoteElements.current[sid].audioEl;
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);
          remoteElements.current[sid].audioEl = audioEl;
        }
        track.attach(audioEl);
        audioEl.play().catch(err => console.warn('Audio play error:', err));
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (participant.isLocal) return;
      const sid = participant.sid;
      if (track.kind === 'video') {
        const vid = remoteElements.current[sid]?.videoEl;
        if (vid) track.detach(vid);
      } else if (track.kind === 'audio') {
        const audioEl = remoteElements.current[sid]?.audioEl;
        if (audioEl) track.detach(audioEl);
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      setIsConnected(false);
      // Освобождаем ссылку при отключении
      roomRef.current = null;
    });

    const connect = async () => {
      try {
        console.log('Attempting to connect to room:', roomId);
        await room.connect(wsUrl, token);
        console.log('Connected to room:', roomId);
        setIsConnected(true);

        await room.localParticipant.enableCameraAndMicrophone();
        setCameraEnabled(true);
        setMicEnabled(true);

        const localVid = localVideoRef.current;
        if (localVid) {
          const videoTracks = room.localParticipant.videoTrackPublications;
          if (videoTracks.size > 0) {
            const pub = videoTracks.values().next().value;
            if (pub.track) {
              pub.track.attach(localVid);
            }
          }
        }
      } catch (err) {
        console.error('Connection error:', err);
        setError(err.message);
        // Сбрасываем ссылку при ошибке, чтобы можно было повторить попытку
        if (roomRef.current === room) {
          roomRef.current = null;
        }
      }
    };

    connect();

    // Cleanup при размонтировании компонента
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      Object.values(remoteElements.current).forEach((el) => {
        if (el.videoWrapper) el.videoWrapper.remove();
        if (el.audioEl) el.audioEl.remove();
      });
      remoteElements.current = {};
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    };
  }, [token, wsUrl]);

  // Функции управления (оставляем без изменений)
  const toggleCamera = async () => {
    if (!roomRef.current) return;
    try {
      const newState = !cameraEnabled;
      await roomRef.current.localParticipant.setCameraEnabled(newState);
      setCameraEnabled(newState);
    } catch (err) {
      console.error('Camera toggle error:', err);
    }
  };

  const toggleMic = async () => {
    if (!roomRef.current) return;
    try {
      const newState = !micEnabled;
      await roomRef.current.localParticipant.setMicrophoneEnabled(newState);
      setMicEnabled(newState);
    } catch (err) {
      console.error('Mic toggle error:', err);
    }
  };

  const copyLink = () => {
    const link = window.location.href;
    navigator.clipboard
      .writeText(link)
      .then(() => alert('Ссылка скопирована!'))
      .catch(() => prompt('Скопируйте ссылку:', link));
  };

  const leaveRoom = () => {
    if (roomRef.current) roomRef.current.disconnect();
    navigate('/');
  };

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Ошибка</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/')}>На главную</button>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '12px',
          background: '#1a1a1a',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3 style={{ margin: 0 }}>Комната: {roomId}</h3>
        <div>
          <button onClick={copyLink} style={{ marginRight: '10px' }}>
            Поделиться ссылкой
          </button>
          <button onClick={leaveRoom}>Выйти</button>
        </div>
      </div>

      <div
        id="video-grid"
        style={{
          flex: 1,
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'flex-start',
          padding: '10px',
          gap: '10px',
          background: '#222',
          overflow: 'auto',
        }}
      >
        <div style={{ position: 'relative', margin: '8px' }}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '200px',
              height: '150px',
              background: '#333',
              borderRadius: '8px',
              transform: 'scaleX(-1)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              bottom: '4px',
              left: '8px',
              color: '#fff',
              fontSize: '12px',
            }}
          >
            Я
          </span>
        </div>
      </div>

      <div
        style={{
          padding: '12px',
          background: '#1a1a1a',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <button
          onClick={toggleCamera}
          style={{
            padding: '8px 16px',
            background: cameraEnabled ? '#4CAF50' : '#f44336',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          {cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
        </button>
        <button
          onClick={toggleMic}
          style={{
            padding: '8px 16px',
            background: micEnabled ? '#4CAF50' : '#f44336',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          {micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
        </button>
        <span style={{ color: '#aaa' }}>
          {isConnected ? '🟢 Подключено' : '🔴 Подключение...'}
        </span>
        <span style={{ color: '#aaa', marginLeft: '20px' }}>
          Участников: {participants.length + 1}
        </span>
      </div>
    </div>
  );
};

export default RoomPage;