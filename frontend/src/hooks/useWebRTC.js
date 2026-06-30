import { useEffect, useRef, useState, useCallback } from 'react';

export const useWebRTC = (socket, roomId, myName, participants, shouldConnect) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const peerConnections = useRef({});
  const localVideoRef = useRef(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);

  // Функция для установки стрима извне (из Room)
  const setExternalStream = useCallback((stream) => {
    setLocalStream(stream);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    // Обновляем состояние камеры/микрофона
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    setCameraEnabled(videoTracks.length > 0 && videoTracks[0].enabled);
    setMicEnabled(audioTracks.length > 0 && audioTracks[0].enabled);
  }, []);

  // Обновление треков во всех пирах
  const updateTracksInAllPeers = useCallback(() => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0] || null;
    const audioTrack = localStream.getAudioTracks()[0] || null;

    Object.values(peerConnections.current).forEach(pc => {
      const senders = pc.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
      if (videoSender) {
        videoSender.replaceTrack(videoTrack).catch(() => {});
      }
      if (audioSender) {
        audioSender.replaceTrack(audioTrack).catch(() => {});
      }
    });
  }, [localStream]);

  // Создание пира для участника
  const createPeerFor = useCallback((targetSocketId) => {
    if (!localStream || !socket) return null;
    if (peerConnections.current[targetSocketId]) {
      peerConnections.current[targetSocketId].close();
      delete peerConnections.current[targetSocketId];
    }
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('signal', {
          roomId,
          targetSocketId,
          signalData: { type: 'ice', candidate: e.candidate },
        });
      }
    };

    pc.ontrack = (e) => {
      setRemoteStreams(prev => {
        const newStreams = { ...prev };
        if (newStreams[targetSocketId]) {
          e.streams[0].getTracks().forEach(t => newStreams[targetSocketId].addTrack(t));
        } else {
          newStreams[targetSocketId] = e.streams[0];
        }
        return newStreams;
      });
    };

    peerConnections.current[targetSocketId] = pc;
    return pc;
  }, [localStream, socket, roomId]);

  // Настройка пиров для всех участников
  const setupAllPeers = useCallback(() => {
    if (!localStream || !socket || !shouldConnect) return;
    const others = participants.filter(p => p.socketId !== socket.id);
    others.forEach(p => {
      if (!peerConnections.current[p.socketId]) {
        const pc = createPeerFor(p.socketId);
        if (pc) {
          pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
              socket.emit('signal', {
                roomId,
                targetSocketId: p.socketId,
                signalData: { type: 'offer', offer: pc.localDescription },
              });
            })
            .catch(err => console.error('Offer error:', err));
        }
      }
    });
  }, [localStream, socket, participants, roomId, createPeerFor, shouldConnect]);

  // Автоматическая настройка при изменении условий
  useEffect(() => {
    if (localStream && socket && shouldConnect) {
      setupAllPeers();
    }
  }, [localStream, socket, participants, shouldConnect, setupAllPeers]);

  // Обновление треков при изменении стрима
  useEffect(() => {
    if (localStream && Object.keys(peerConnections.current).length > 0) {
      updateTracksInAllPeers();
    }
  }, [localStream, updateTracksInAllPeers]);

  // Обработка входящих сигналов
  useEffect(() => {
    if (!socket) return;
    const handleSignal = ({ fromSocketId, signalData }) => {
      let pc = peerConnections.current[fromSocketId];
      if (!pc) {
        if (signalData.type === 'offer') {
          pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          });
          localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
          pc.onicecandidate = (e) => {
            if (e.candidate) {
              socket.emit('signal', {
                roomId,
                targetSocketId: fromSocketId,
                signalData: { type: 'ice', candidate: e.candidate },
              });
            }
          };
          pc.ontrack = (e) => {
            setRemoteStreams(prev => {
              const newStreams = { ...prev };
              if (newStreams[fromSocketId]) {
                e.streams[0].getTracks().forEach(t => newStreams[fromSocketId].addTrack(t));
              } else {
                newStreams[fromSocketId] = e.streams[0];
              }
              return newStreams;
            });
          };
          peerConnections.current[fromSocketId] = pc;
        } else {
          return;
        }
      }
      if (signalData.type === 'offer') {
        pc.setRemoteDescription(new RTCSessionDescription(signalData.offer))
          .then(() => pc.createAnswer())
          .then(answer => pc.setLocalDescription(answer))
          .then(() => {
            socket.emit('signal', {
              roomId,
              targetSocketId: fromSocketId,
              signalData: { type: 'answer', answer: pc.localDescription },
            });
          })
          .catch(err => console.error('Answer error:', err));
      } else if (signalData.type === 'answer') {
        pc.setRemoteDescription(new RTCSessionDescription(signalData.answer))
          .catch(err => console.error('Set remote desc error:', err));
      } else if (signalData.type === 'ice') {
        pc.addIceCandidate(new RTCIceCandidate(signalData.candidate))
          .catch(err => console.error('ICE error:', err));
      }
    };
    socket.on('signal', handleSignal);
    return () => {
      socket.off('signal', handleSignal);
    };
  }, [socket, localStream, roomId]);

  // ---- Управление камерой ----
  const toggleCamera = useCallback(async () => {
    if (isScreenSharing) return;
    if (!localStream) return;

    const videoTracks = localStream.getVideoTracks();
    if (cameraEnabled) {
      const track = videoTracks[0];
      if (track) {
        track.stop();
        localStream.removeTrack(track);
        setCameraEnabled(false);
        updateTracksInAllPeers();
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = stream.getVideoTracks()[0];
        localStream.addTrack(newTrack);
        setCameraEnabled(true);
        updateTracksInAllPeers();
      } catch (err) {
        console.error('Cannot get camera:', err);
      }
    }
  }, [localStream, cameraEnabled, isScreenSharing, updateTracksInAllPeers]);

  // ---- Управление микрофоном ----
  const toggleMic = useCallback(async () => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    if (micEnabled) {
      const track = audioTracks[0];
      if (track) {
        track.stop();
        localStream.removeTrack(track);
        setMicEnabled(false);
        updateTracksInAllPeers();
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newTrack = stream.getAudioTracks()[0];
        localStream.addTrack(newTrack);
        setMicEnabled(true);
        updateTracksInAllPeers();
      } catch (err) {
        console.error('Cannot get mic:', err);
      }
    }
  }, [localStream, micEnabled, updateTracksInAllPeers]);

  // ---- Демонстрация экрана ----
  const toggleScreenShare = useCallback(async () => {
    if (!localStream) return;
    if (isScreenSharing) {
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        setScreenStream(null);
      }
      setIsScreenSharing(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = stream.getVideoTracks()[0];
        const oldVideo = localStream.getVideoTracks()[0];
        if (oldVideo) {
          localStream.removeTrack(oldVideo);
          oldVideo.stop();
        }
        localStream.addTrack(newTrack);
        setCameraEnabled(true);
        updateTracksInAllPeers();
      } catch (err) {
        console.error('Cannot get camera after screen share:', err);
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = stream.getVideoTracks()[0];
        track.onended = () => {
          if (isScreenSharing) {
            toggleScreenShare();
          }
        };
        setScreenStream(stream);
        setIsScreenSharing(true);
        const oldVideo = localStream.getVideoTracks()[0];
        if (oldVideo) {
          localStream.removeTrack(oldVideo);
          oldVideo.stop();
        }
        localStream.addTrack(track);
        setCameraEnabled(false);
        updateTracksInAllPeers();
      } catch (err) {
        console.error('Screen share error:', err);
      }
    }
  }, [localStream, isScreenSharing, screenStream, updateTracksInAllPeers]);

  // Очистка
  useEffect(() => {
    return () => {
      Object.values(peerConnections.current).forEach(pc => pc.close());
      peerConnections.current = {};
    };
  }, []);

  return {
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
    setLocalStream: setExternalStream, // экспортируем функцию для установки стрима
  };
};