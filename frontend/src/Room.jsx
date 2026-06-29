import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Room, RoomEvent, Track } from 'livekit-client';

const RoomPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const savedUserName = sessionStorage.getItem(`userName_${roomId}`) || '';
  const savedCamera = sessionStorage.getItem(`cameraEnabled_${roomId}`) !== 'false';
  const savedMic = sessionStorage.getItem(`micEnabled_${roomId}`) !== 'false';

  const [step, setStep] = useState('prejoin');
  const [userName, setUserName] = useState(savedUserName);
  const [cameraEnabled, setCameraEnabled] = useState(savedCamera);
  const [micEnabled, setMicEnabled] = useState(savedMic);
  const [localStream, setLocalStream] = useState(null);

  const [token, setToken] = useState(null);
  const [wsUrl, setWsUrl] = useState(null);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState([]);

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareParticipantSid, setScreenShareParticipantSid] = useState(null);

  // Для prejoin храним треки отдельно
  const [prejoinVideoTrack, setPrejoinVideoTrack] = useState(null);
  const [prejoinAudioTrack, setPrejoinAudioTrack] = useState(null);

  const roomRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteElements = useRef({});
  const prejoinVideoRef = useRef(null);
  const screenVideoRef = useRef(null);

  // Сохраняем имя и настройки
  useEffect(() => {
    sessionStorage.setItem(`userName_${roomId}`, userName);
  }, [userName, roomId]);

  useEffect(() => {
    sessionStorage.setItem(`cameraEnabled_${roomId}`, cameraEnabled);
  }, [cameraEnabled, roomId]);

  useEffect(() => {
    sessionStorage.setItem(`micEnabled_${roomId}`, micEnabled);
  }, [micEnabled, roomId]);

  // ===== PreJoin =====
  useEffect(() => {
    if (step !== 'prejoin') return;
    const getStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        setPrejoinVideoTrack(videoTrack);
        setPrejoinAudioTrack(audioTrack);
        if (prejoinVideoRef.current) {
          prejoinVideoRef.current.srcObject = stream;
        }
        // Применяем сохранённые настройки
        if (!savedCamera) videoTrack.enabled = false;
        if (!savedMic) audioTrack.enabled = false;
        setCameraEnabled(savedCamera);
        setMicEnabled(savedMic);
      } catch (err) {
        console.error('Error accessing media devices:', err);
        setError('Не удалось получить доступ к камере и микрофону');
      }
    };
    getStream();
    return () => {
      if (prejoinVideoTrack) prejoinVideoTrack.stop();
      if (prejoinAudioTrack) prejoinAudioTrack.stop();
    };
  }, [step]);

  const togglePrejoinCamera = async () => {
    if (cameraEnabled) {
      if (prejoinVideoTrack) {
        prejoinVideoTrack.stop();
        setPrejoinVideoTrack(null);
      }
      setCameraEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = stream.getVideoTracks()[0];
        setPrejoinVideoTrack(newTrack);
        // Обновляем отображение
        const combined = new MediaStream();
        if (prejoinAudioTrack) combined.addTrack(prejoinAudioTrack);
        combined.addTrack(newTrack);
        if (prejoinVideoRef.current) prejoinVideoRef.current.srcObject = combined;
        setCameraEnabled(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const togglePrejoinMic = async () => {
    if (micEnabled) {
      if (prejoinAudioTrack) {
        prejoinAudioTrack.stop();
        setPrejoinAudioTrack(null);
      }
      setMicEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newTrack = stream.getAudioTracks()[0];
        setPrejoinAudioTrack(newTrack);
        const combined = new MediaStream();
        if (prejoinVideoTrack) combined.addTrack(prejoinVideoTrack);
        combined.addTrack(newTrack);
        if (prejoinVideoRef.current) prejoinVideoRef.current.srcObject = combined;
        setMicEnabled(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const joinRoom = async () => {
    if (!userName.trim()) {
      setError('Пожалуйста, введите имя');
      return;
    }
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/rooms/${roomId}/token?name=${encodeURIComponent(userName.trim())}`
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Ошибка получения токена');
      }
      const data = await response.json();
      setToken(data.token);
      setWsUrl(data.wsUrl || 'ws://localhost:7880');
      setStep('room');
    } catch (err) {
      setError(err.message);
    }
  };

  // ===== Room connection =====
  useEffect(() => {
    if (step !== 'room' || !token || !wsUrl) return;
    if (roomRef.current) return;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 640, height: 480 },
      },
    });
    roomRef.current = room;

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
      if (screenShareParticipantSid === participant.sid) {
        setScreenShareParticipantSid(null);
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = null;
        }
      }
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (participant.isLocal) return;
      const sid = participant.sid;

      if (track.kind === 'video' && track.source === Track.Source.ScreenShare) {
        if (screenShareParticipantSid && screenShareParticipantSid !== sid) {
          console.log('Screen share already active, skipping');
          return;
        }
        setScreenShareParticipantSid(sid);
        if (screenVideoRef.current) {
          track.attach(screenVideoRef.current);
          console.log('Screen share attached for participant', sid);
        }
        return;
      }

      if (track.kind === 'video' && track.source === Track.Source.Camera) {
        if (!remoteElements.current[sid]) {
          remoteElements.current[sid] = {};
        }
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
          label.textContent = participant.name || 'Участник';
          wrapper.appendChild(vid);
          wrapper.appendChild(label);
          container.appendChild(wrapper);
          remoteElements.current[sid].videoWrapper = wrapper;
          remoteElements.current[sid].videoEl = vid;
        }
        track.attach(remoteElements.current[sid].videoEl);
      } else if (track.kind === 'audio') {
        if (!remoteElements.current[sid]) {
          remoteElements.current[sid] = {};
        }
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
      if (track.kind === 'video' && track.source === Track.Source.ScreenShare) {
        console.log('Screen share track unsubscribed for participant', sid);
        setScreenShareParticipantSid(null);
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = null;
        }
        return;
      }
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
      roomRef.current = null;
      setScreenShareParticipantSid(null);
      setIsScreenSharing(false);
    });

    const connect = async () => {
      try {
        await room.connect(wsUrl, token);
        setIsConnected(true);

        // Публикуем камеру и микрофон в зависимости от состояния
        if (cameraEnabled) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          const track = stream.getVideoTracks()[0];
          await room.localParticipant.publishTrack(track, { source: Track.Source.Camera });
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        } else {
          // Если камера выключена, то локальное видео должно быть чёрным
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
          }
        }

        if (micEnabled) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const track = stream.getAudioTracks()[0];
          await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone });
        }
        console.log('Connected to room');
      } catch (err) {
        console.error('Connection error:', err);
        setError(err.message);
        roomRef.current = null;
      }
    };

    connect();

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
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = null;
      }
      setScreenShareParticipantSid(null);
      setIsScreenSharing(false);
    };
  }, [step, token, wsUrl]);

  // ===== Демонстрация экрана =====
  const toggleScreenShare = async () => {
    if (!roomRef.current) return;

    if (screenShareParticipantSid && !isScreenSharing) {
      alert('Кто-то уже демонстрирует экран');
      return;
    }

    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    // Начать демонстрацию
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) {
        throw new Error('No video track available');
      }

      const publication = await roomRef.current.localParticipant.publishTrack(track, {
        source: Track.Source.ScreenShare,
        name: 'screen',
      });

      setIsScreenSharing(true);
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
        screenVideoRef.current.muted = true;
      }

      track.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.error('Error starting screen share:', err);
      alert('Не удалось начать демонстрацию экрана: ' + err.message);
    }
  };

  const stopScreenShare = async () => {
    if (!roomRef.current) return;
    const pub = roomRef.current.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    if (pub && pub.track) {
      pub.track.stop(); // физически останавливаем захват
      await roomRef.current.localParticipant.unpublishTrack(pub.track);
    }
    setIsScreenSharing(false);
    setScreenShareParticipantSid(null);
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
  };

  // ===== Управление камерой и микрофоном в звонке =====
  const toggleCamera = async () => {
    if (!roomRef.current) return;
    const participant = roomRef.current.localParticipant;
    try {
      if (cameraEnabled) {
        // Выключаем камеру
        const pub = participant.getTrackPublication(Track.Source.Camera);
        if (pub && pub.track) {
          pub.track.stop();
          await participant.unpublishTrack(pub.track);
        }
        setCameraEnabled(false);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = null;
        }
      } else {
        // Включаем камеру
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = stream.getVideoTracks()[0];
        await participant.publishTrack(track, { source: Track.Source.Camera });
        setCameraEnabled(true);
        if (localVideoRef.current) {
          // Создаём новый MediaStream с этим треком, чтобы отобразить локальное видео
          const newStream = new MediaStream();
          newStream.addTrack(track);
          localVideoRef.current.srcObject = newStream;
        }
      }
    } catch (err) {
      console.error('Camera toggle error:', err);
    }
  };

  const toggleMic = async () => {
    if (!roomRef.current) return;
    const participant = roomRef.current.localParticipant;
    try {
      if (micEnabled) {
        const pub = participant.getTrackPublication(Track.Source.Microphone);
        if (pub && pub.track) {
          pub.track.stop();
          await participant.unpublishTrack(pub.track);
        }
        setMicEnabled(false);
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const track = stream.getAudioTracks()[0];
        await participant.publishTrack(track, { source: Track.Source.Microphone });
        setMicEnabled(true);
      }
    } catch (err) {
      console.error('Mic toggle error:', err);
    }
  };

  const leaveRoom = () => {
    if (roomRef.current) roomRef.current.disconnect();
    sessionStorage.removeItem(`userName_${roomId}`);
    sessionStorage.removeItem(`cameraEnabled_${roomId}`);
    sessionStorage.removeItem(`micEnabled_${roomId}`);
    navigate('/');
  };

  // ===== PreJoin view =====
  if (step === 'prejoin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111', color: '#fff' }}>
        <h2>Настройка перед звонком</h2>
        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="Ваше имя"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={{ padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ccc', background: '#222', color: '#fff' }}
          />
        </div>
        <div style={{ position: 'relative', width: '320px', height: '240px', background: '#333', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
          <video
            ref={prejoinVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', transform: 'scaleX(-1)' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <button onClick={togglePrejoinCamera} style={{ padding: '8px 16px', background: cameraEnabled ? '#4CAF50' : '#f44336', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>
            {cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
          </button>
          <button onClick={togglePrejoinMic} style={{ padding: '8px 16px', background: micEnabled ? '#4CAF50' : '#f44336', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>
            {micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
          </button>
        </div>
        <button onClick={joinRoom} style={{ padding: '12px 24px', fontSize: '18px', background: '#007bff', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>
          Войти в звонок
        </button>
        {error && <p style={{ color: 'red', marginTop: '10px' }}>{error}</p>}
      </div>
    );
  }

  // ===== Room view =====
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px', background: '#1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Комната: {roomId}</h3>
        <div>
          <button onClick={() => { navigator.clipboard.writeText(window.location.href); alert('Ссылка скопирована!'); }} style={{ marginRight: '10px' }}>
            Поделиться ссылкой
          </button>
          <button onClick={leaveRoom}>Выйти</button>
        </div>
      </div>

      <div style={{ width: '100%', height: '300px', background: '#111', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
        <video
          ref={screenVideoRef}
          autoPlay
          playsInline
          style={{ maxWidth: '100%', maxHeight: '100%', background: '#222' }}
        />
        {!screenShareParticipantSid && !isScreenSharing && (
          <span style={{ color: '#666', position: 'absolute' }}>Никто не делится экраном</span>
        )}
        {isScreenSharing && (
          <span style={{ color: '#0f0', position: 'absolute', bottom: '10px', left: '10px', fontSize: '14px' }}>
            Вы демонстрируете экран
          </span>
        )}
        {screenShareParticipantSid && !isScreenSharing && (
          <span style={{ color: '#ff0', position: 'absolute', bottom: '10px', left: '10px', fontSize: '14px' }}>
            Демонстрация экрана
          </span>
        )}
      </div>

      <div id="video-grid" style={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', padding: '10px', gap: '10px', background: '#222', overflow: 'auto' }}>
        <div style={{ position: 'relative', margin: '8px' }}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '200px', height: '150px', background: '#333', borderRadius: '8px', transform: 'scaleX(-1)' }}
          />
          <span style={{ position: 'absolute', bottom: '4px', left: '8px', color: '#fff', fontSize: '12px' }}>
            {userName || 'Я'}
          </span>
        </div>
      </div>

      <div style={{ padding: '12px', background: '#1a1a1a', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <button onClick={toggleCamera} style={{ padding: '8px 16px', background: cameraEnabled ? '#4CAF50' : '#f44336', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>
          {cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
        </button>
        <button onClick={toggleMic} style={{ padding: '8px 16px', background: micEnabled ? '#4CAF50' : '#f44336', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>
          {micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
        </button>
        <button
          onClick={toggleScreenShare}
          disabled={!!screenShareParticipantSid && !isScreenSharing}
          style={{
            padding: '8px 16px',
            background: isScreenSharing ? '#f44336' : (screenShareParticipantSid ? '#888' : '#4CAF50'),
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: (screenShareParticipantSid && !isScreenSharing) ? 'not-allowed' : 'pointer',
          }}
        >
          {isScreenSharing ? 'Остановить экран' : (screenShareParticipantSid ? 'Экран занят' : 'Поделиться экраном')}
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