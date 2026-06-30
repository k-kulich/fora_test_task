import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from './hooks/useSocket';
import { useWebRTC } from './hooks/useWebRTC';

// SVG иконки (ваши, компактно)
const IconMic = ({ enabled }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
    {!enabled && <line x1="3" y1="3" x2="21" y2="21" />}
  </svg>
);

const IconCamera = ({ enabled }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M23 7l-7 5 7 5V7z" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    {!enabled && <line x1="3" y1="3" x2="21" y2="21" />}
  </svg>
);

const IconScreenShare = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
    <path d="M8 7l4 4 4-4" />
  </svg>
);

const IconLeave = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const IconSend = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconCopy = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const Room = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [userName, setUserName] = useState('');
  const [step, setStep] = useState('prejoin');
  const [shouldConnect, setShouldConnect] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState('');
  const [showStatus, setShowStatus] = useState(false);
  const chatContainerRef = useRef(null);
  const screenVideoRef = useRef(null);

  // Prejoin
  const [prejoinVideoTrack, setPrejoinVideoTrack] = useState(null);
  const [prejoinAudioTrack, setPrejoinAudioTrack] = useState(null);
  const [cameraEnabledPre, setCameraEnabledPre] = useState(true);
  const [micEnabledPre, setMicEnabledPre] = useState(true);
  const prejoinVideoRef = useRef(null);

  const onStateUpdate = useCallback((type, data) => {
    if (type === 'state') {
      setParticipants(data.participants);
      setMessages(data.messages);
    } else if (type === 'joined') {
      setParticipants(prev => [...prev, { socketId: data.socketId, name: data.name }]);
    } else if (type === 'left') {
      setParticipants(prev => prev.filter(p => p.socketId !== data.socketId));
    } else if (type === 'chat') {
      setMessages(prev => [...prev, data]);
    } else if (type === 'error' || type === 'room-full') {
      setError(data.message || 'Ошибка');
    }
  }, []);

  const { socket, isConnected } = useSocket(roomId, userName, onStateUpdate, shouldConnect);
  const {
    localStream,
    remoteStreams,
    localVideoRef,
    cameraEnabled,
    micEnabled,
    toggleCamera,
    toggleMic,
    isScreenSharing,
    toggleScreenShare,
    screenStream,
  } = useWebRTC(socket, roomId, userName, participants, shouldConnect);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
    if (screenVideoRef.current && !screenStream) {
      screenVideoRef.current.srcObject = null;
    }
  }, [screenStream]);

  useEffect(() => {
    if (isConnected) {
      setShowStatus(true);
      const timer = setTimeout(() => setShowStatus(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isConnected]);

  // PreJoin
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
        if (!cameraEnabledPre) videoTrack.enabled = false;
        if (!micEnabledPre) audioTrack.enabled = false;
      } catch (err) {
        console.error(err);
        setError('Could not access camera and microphone');
      }
    };
    getStream();
    return () => {
      if (prejoinVideoTrack) prejoinVideoTrack.stop();
      if (prejoinAudioTrack) prejoinAudioTrack.stop();
    };
  }, [step]);

  const togglePrejoinCamera = async () => {
    if (cameraEnabledPre) {
      if (prejoinVideoTrack) {
        prejoinVideoTrack.stop();
        setPrejoinVideoTrack(null);
      }
      setCameraEnabledPre(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = stream.getVideoTracks()[0];
        setPrejoinVideoTrack(newTrack);
        const combined = new MediaStream();
        if (prejoinAudioTrack) combined.addTrack(prejoinAudioTrack);
        combined.addTrack(newTrack);
        if (prejoinVideoRef.current) prejoinVideoRef.current.srcObject = combined;
        setCameraEnabledPre(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const togglePrejoinMic = async () => {
    if (micEnabledPre) {
      if (prejoinAudioTrack) {
        prejoinAudioTrack.stop();
        setPrejoinAudioTrack(null);
      }
      setMicEnabledPre(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newTrack = stream.getAudioTracks()[0];
        setPrejoinAudioTrack(newTrack);
        const combined = new MediaStream();
        if (prejoinVideoTrack) combined.addTrack(prejoinVideoTrack);
        combined.addTrack(newTrack);
        if (prejoinVideoRef.current) prejoinVideoRef.current.srcObject = combined;
        setMicEnabledPre(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const joinRoom = () => {
    const trimmed = userName.trim();
    if (!trimmed) {
      setError('Введите имя');
      return;
    }
    setError('');
    setShouldConnect(true);
    setStep('room');
  };

  const sendMessage = () => {
    if (!chatInput.trim() || !socket) return;
    socket.emit('chat-message', { roomId, text: chatInput.trim() });
    setChatInput('');
  };

  const leaveRoom = () => {
    if (socket) {
      socket.emit('leave-room', { roomId });
      socket.disconnect();
    }
    navigate('/');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => alert('Ссылка скопирована'))
      .catch(() => alert('Не удалось скопировать'));
  };

  if (step === 'prejoin') {
    return (
      <div style={prejoinStyles.page}>
        <div style={prejoinStyles.card}>
          <h2 style={prejoinStyles.title}>Check your devices</h2>
          <div style={prejoinStyles.videoWrapper}>
            <video
              ref={prejoinVideoRef}
              autoPlay
              playsInline
              muted
              style={prejoinStyles.video}
            />
          </div>
          <div style={prejoinStyles.controls}>
            <button onClick={togglePrejoinCamera} style={prejoinStyles.iconButton}>
              <IconCamera enabled={cameraEnabledPre} />
            </button>
            <button onClick={togglePrejoinMic} style={prejoinStyles.iconButton}>
              <IconMic enabled={micEnabledPre} />
            </button>
          </div>
          <div style={prejoinStyles.roomInfo}>
            Комната: <span style={prejoinStyles.roomName}>{roomId}</span>
          </div>
          <input
            type="text"
            placeholder="Ваше имя"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={prejoinStyles.input}
            maxLength={30}
          />
          <button onClick={joinRoom} style={prejoinStyles.joinButton}>
            Join Call
          </button>
          {error && <p style={prejoinStyles.error}>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={roomStyles.container}>
      {showStatus && (
        <div style={roomStyles.notification}>
          <span>{isConnected ? '🟢 Connected' : '🔴 Disconnected'}</span>
          <button onClick={() => setShowStatus(false)} style={roomStyles.closeNotif}>
            <IconClose />
          </button>
        </div>
      )}

      <div style={roomStyles.mainArea}>
        <div style={roomStyles.videoArea}>
          {isScreenSharing && (
            <div style={roomStyles.screenContainer}>
              <video ref={screenVideoRef} autoPlay playsInline style={roomStyles.screenVideo} />
              <span style={roomStyles.screenLabel}>You are sharing</span>
            </div>
          )}

          <div style={roomStyles.gridWrapper}>
            <div id="video-grid" style={roomStyles.grid}>
              <div style={roomStyles.participantTile}>
                {cameraEnabled ? (
                  <video ref={localVideoRef} autoPlay muted playsInline style={{ ...roomStyles.videoTile, transform: 'scaleX(-1)' }} />
                ) : (
                  <div style={{ ...roomStyles.placeholderOverlay, fontSize: '64px', fontWeight: 'bold', background: '#333', color: '#FA37DA' }}>
                    {(userName || '?')[0].toUpperCase()}
                  </div>
                )}
                <span style={roomStyles.participantName}>{userName || 'You'}</span>
              </div>
              {Object.entries(remoteStreams).map(([socketId, stream]) => {
                const p = participants.find(pp => pp.socketId === socketId);
                return (
                  <div key={socketId} style={roomStyles.participantTile}>
                    <video autoPlay playsInline ref={el => { if (el) el.srcObject = stream; }} style={roomStyles.videoTile} />
                    <span style={roomStyles.participantName}>{p?.name || 'Участник'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={roomStyles.chatPanel}>
          <div style={roomStyles.chatHeader}>Chat</div>
          <div ref={chatContainerRef} style={roomStyles.chatMessages}>
            {messages.length === 0 && <div style={roomStyles.emptyChat}>No messages yet</div>}
            {messages.map((msg, idx) => (
              <div key={idx} style={roomStyles.chatMessage}>
                <strong style={roomStyles.chatSender}>{msg.senderName}:</strong> {msg.text}
              </div>
            ))}
          </div>
          <div style={roomStyles.chatInputRow}>
            <input
              type="text"
              placeholder="Type a message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              style={roomStyles.chatInput}
            />
            <button onClick={sendMessage} style={roomStyles.sendButton}>
              <IconSend />
            </button>
          </div>
        </div>
      </div>

      <div style={roomStyles.controlsBar}>
        <button
          onClick={toggleCamera}
          style={{
            ...roomStyles.controlButton,
            opacity: isScreenSharing ? 0.4 : 1,
            cursor: isScreenSharing ? 'not-allowed' : 'pointer',
          }}
          disabled={isScreenSharing}
        >
          <IconCamera enabled={cameraEnabled} />
        </button>
        <button onClick={toggleMic} style={roomStyles.controlButton}>
          <IconMic enabled={micEnabled} />
        </button>
        <button onClick={toggleScreenShare} style={{ ...roomStyles.controlButton, ...(isScreenSharing ? roomStyles.controlButtonActive : {}) }}>
          <IconScreenShare />
        </button>
        <button onClick={leaveRoom} style={{ ...roomStyles.controlButton, background: '#ff4444' }}>
          <IconLeave />
        </button>
        <button onClick={copyLink} style={roomStyles.controlButton}>
          <IconCopy />
        </button>
      </div>
    </div>
  );
};

const prejoinStyles = {
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
    padding: '40px 32px',
    maxWidth: '420px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 20px 40px rgba(250,55,218,0.25), 0 0 0 1px rgba(76,55,250,0.2)',
    boxSizing: 'border-box',
  },
  title: { fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '24px' },
  videoWrapper: { width: '100%', aspectRatio: '4/3', background: '#222', borderRadius: '20px', overflow: 'hidden', marginBottom: '20px' },
  video: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
  controls: { display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '24px' },
  iconButton: { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(250,55,218,0.4)', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', transition: '0.2s' },
  roomInfo: { color: '#aaa', fontSize: '14px', marginBottom: '16px' },
  roomName: { color: '#fff', fontWeight: 600 },
  input: { width: '100%', padding: '14px 20px', borderRadius: '60px', border: '1px solid rgba(250,55,218,0.4)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '16px', outline: 'none', marginBottom: '20px', fontFamily: 'inherit', boxSizing: 'border-box' },
  joinButton: { width: '100%', padding: '14px', borderRadius: '60px', border: 'none', background: 'linear-gradient(95deg, #FA37DA, #4C37FA)', color: '#fff', fontSize: '18px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(76,55,250,0.3)', fontFamily: 'inherit' },
  error: { color: '#ff6b6b', fontSize: '14px', marginTop: '12px' },
};

const roomStyles = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#111', fontFamily: "'Inter', sans-serif", position: 'relative' },
  notification: { position: 'fixed', top: '20px', right: '20px', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(250,55,218,0.3)', borderRadius: '40px', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '12px', color: '#fff', fontSize: '14px', zIndex: 100, boxShadow: '0 8px 20px rgba(0,0,0,0.5)' },
  closeNotif: { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '0', display: 'flex' },
  mainArea: { flex: 1, display: 'flex', overflow: 'hidden', padding: '16px', gap: '16px' },
  videoArea: { flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 },
  screenContainer: { width: '100%', height: '300px', background: '#222', borderRadius: '20px', overflow: 'hidden', position: 'relative', flexShrink: 0 },
  screenVideo: { width: '100%', height: '100%', objectFit: 'contain', background: '#111' },
  screenLabel: { position: 'absolute', bottom: '12px', left: '16px', color: '#fff', fontSize: '14px', background: 'rgba(0,0,0,0.6)', padding: '4px 12px', borderRadius: '20px' },
  gridWrapper: { flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  grid: { display: 'flex', flexWrap: 'nowrap', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '8px 16px', overflowX: 'auto', scrollBehavior: 'smooth', height: '100%', minHeight: '150px' },
  participantTile: { position: 'relative', width: '200px', height: '150px', background: '#333', borderRadius: '16px', overflow: 'hidden', flexShrink: 0 },
  videoTile: { width: '100%', height: '100%', objectFit: 'cover', background: '#222' },
  participantName: { position: 'absolute', bottom: '6px', left: '10px', color: '#fff', fontSize: '13px', textShadow: '0 1px 4px rgba(0,0,0,0.8)' },
  placeholderOverlay: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '14px' },
  chatPanel: { width: '280px', background: '#1a1a1a', borderRadius: '24px', display: 'flex', flexDirection: 'column', border: '1px solid rgba(250,55,218,0.15)', flexShrink: 0 },
  chatHeader: { padding: '14px 18px', fontWeight: 600, color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  chatMessages: { flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' },
  emptyChat: { color: '#666', textAlign: 'center', marginTop: '30px', fontSize: '14px' },
  chatMessage: { background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '12px', fontSize: '14px', color: '#eee', wordBreak: 'break-word' },
  chatSender: { color: '#FA37DA', marginRight: '4px' },
  chatInputRow: { display: 'flex', padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', gap: '8px' },
  chatInput: { flex: 1, padding: '10px 16px', borderRadius: '40px', border: '1px solid rgba(250,55,218,0.3)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px', outline: 'none', fontFamily: 'inherit' },
  sendButton: { background: 'linear-gradient(95deg, #FA37DA, #4C37FA)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', flexShrink: 0 },
  controlsBar: { display: 'flex', justifyContent: 'center', gap: '24px', padding: '16px 24px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', borderTop: '1px solid rgba(250,55,218,0.1)' },
  controlButton: { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(250,55,218,0.3)', borderRadius: '50%', width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', transition: '0.2s' },
  controlButtonActive: { background: 'rgba(250,55,218,0.3)', borderColor: '#FA37DA' },
};

export default Room;