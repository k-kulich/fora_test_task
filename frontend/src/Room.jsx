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
  const remoteVideoRefs = useRef({});

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
    if (!token || !wsUrl) return;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 640, height: 480 },
      },
    });
    roomRef.current = room;

    // События
    room.on(RoomEvent.ParticipantConnected, (participant) => {
      setParticipants((prev) => [...prev, participant]);
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      setParticipants((prev) => prev.filter((p) => p.sid !== participant.sid));
      // удаляем видео элемент
      const vid = remoteVideoRefs.current[participant.sid];
      if (vid) {
        vid.srcObject = null;
        delete remoteVideoRefs.current[participant.sid];
      }
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      // если это видео трек удалённого участника
      if (track.kind === 'video' && !participant.isLocal) {
        const sid = participant.sid;
        let vid = remoteVideoRefs.current[sid];
        if (!vid) {
          // создадим элемент динамически? но проще использовать ref, но мы не знаем, когда будет отрендерен div
          // поэтому воспользуемся подходом: в рендере мы создаём div для каждого участника, а здесь найдём его
          // или просто создадим и добавим в контейнер
          const container = document.getElementById('video-grid');
          if (container) {
            const wrapper = document.createElement('div');
            wrapper.style.position = 'relative';
            wrapper.style.margin = '8px';
            vid = document.createElement('video');
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
            remoteVideoRefs.current[sid] = vid;
          }
        }
        if (vid) {
          track.attach(vid);
        }
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (track.kind === 'video' && !participant.isLocal) {
        const vid = remoteVideoRefs.current[participant.sid];
        if (vid) {
          track.detach(vid);
        }
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      setIsConnected(false);
    });

    const connect = async () => {
      try {
        await room.connect(wsUrl, token);
        setIsConnected(true);

        // Включаем камеру и микрофон
        await room.localParticipant.enableCameraAndMicrophone();
        setCameraEnabled(true);
        setMicEnabled(true);

        // Прикрепляем локальное видео к localVideoRef
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

        console.log('Connected to room');
      } catch (err) {
        console.error('Connection error:', err);
        setError(err.message);
      }
    };

    connect();

    return () => {
      room.disconnect();
      // очистка
      Object.values(remoteVideoRefs.current).forEach((vid) => {
        vid.srcObject = null;
      });
      remoteVideoRefs.current = {};
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    };
  }, [token, wsUrl]);

  // Функции управления
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
        {/* Локальное видео */}
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
        {/* Удалённые участники будут добавляться динамически через TrackSubscribed */}
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