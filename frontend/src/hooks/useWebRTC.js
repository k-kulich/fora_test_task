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
  const isSettingUp = useRef(false);

  // Инициализация локального стрима (один раз)
  useEffect(() => {
    const initStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('getUserMedia init error:', err);
        // Если нет устройств, создаём стрим без видео/аудио
        const emptyStream = new MediaStream();
        setLocalStream(emptyStream);
      }
    };
    initStream();
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Функция обновления локального стрима (создаёт новый MediaStream)
  const updateLocalStream = useCallback((newStream) => {
    // Закрываем старые треки
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
    }
    setLocalStream(newStream);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = newStream;
    }
  }, [localStream]);

  // Создание пира для одного участника
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
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', {
          roomId,
          targetSocketId,
          signalData: { type: 'ice', candidate: event.candidate },
        });
      }
    };
    pc.ontrack = (event) => {
      setRemoteStreams(prev => {
        const newStreams = { ...prev };
        if (newStreams[targetSocketId]) {
          const existing = newStreams[targetSocketId];
          event.streams[0].getTracks().forEach(t => existing.addTrack(t));
        } else {
          newStreams[targetSocketId] = event.streams[0];
        }
        return newStreams;
      });
    };
    peerConnections.current[targetSocketId] = pc;
    return pc;
  }, [localStream, socket, roomId]);

  // Настройка всех пиров (закрываем старые, создаём новые)
  const setupAllPeers = useCallback(() => {
    if (isSettingUp.current) return;
    if (!localStream || !socket || !shouldConnect) return;
    isSettingUp.current = true;
    Object.values(peerConnections.current).forEach(pc => pc.close());
    peerConnections.current = {};
    setRemoteStreams({});
    const others = participants.filter(p => p.socketId !== socket.id);
    others.forEach(p => createPeerFor(p.socketId));
    Object.keys(peerConnections.current).forEach(targetId => {
      const pc = peerConnections.current[targetId];
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('signal', {
            roomId,
            targetSocketId: targetId,
            signalData: { type: 'offer', offer: pc.localDescription },
          });
        })
        .catch(err => console.error('Offer error:', err));
    });
    isSettingUp.current = false;
  }, [localStream, socket, participants, roomId, createPeerFor, shouldConnect]);

  // Пересоздаём пиры при изменении localStream или participants
  useEffect(() => {
    if (localStream && socket && shouldConnect) {
      setupAllPeers();
    }
  }, [localStream, socket, participants, shouldConnect, setupAllPeers]);

  // Обработка входящих сигналов
  useEffect(() => {
    if (!socket) return;
    const handleSignal = ({ fromSocketId, signalData }) => {
      let pc = peerConnections.current[fromSocketId];
      if (!pc) {
        if (signalData.type === 'offer') {
          pc = createPeerFor(fromSocketId);
          if (!pc) return;
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
  }, [socket, createPeerFor, roomId]);

  // Новый участник присоединился
  useEffect(() => {
    if (!socket) return;
    const handleParticipantJoined = (participant) => {
      if (participant.socketId === socket.id) return;
      if (!peerConnections.current[participant.socketId]) {
        const pc = createPeerFor(participant.socketId);
        if (pc) {
          pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
              socket.emit('signal', {
                roomId,
                targetSocketId: participant.socketId,
                signalData: { type: 'offer', offer: pc.localDescription },
              });
            })
            .catch(err => console.error('Offer error:', err));
        }
      }
    };
    socket.on('participant-joined', handleParticipantJoined);
    return () => {
      socket.off('participant-joined', handleParticipantJoined);
    };
  }, [socket, createPeerFor, roomId]);

  // Участник вышел
  useEffect(() => {
    if (!socket) return;
    const handleParticipantLeft = ({ socketId }) => {
      if (peerConnections.current[socketId]) {
        peerConnections.current[socketId].close();
        delete peerConnections.current[socketId];
      }
      setRemoteStreams(prev => {
        const newStreams = { ...prev };
        delete newStreams[socketId];
        return newStreams;
      });
    };
    socket.on('participant-left', handleParticipantLeft);
    return () => {
      socket.off('participant-left', handleParticipantLeft);
    };
  }, [socket]);

  // ---- Управление камерой ----
  const toggleCamera = useCallback(async () => {
    if (isScreenSharing) return;
    if (!localStream) return;

    // Получаем текущие треки
    const audioTracks = localStream.getAudioTracks();
    const videoTracks = localStream.getVideoTracks();

    if (cameraEnabled) {
      // Выключаем камеру
      const videoTrack = videoTracks[0];
      if (videoTrack) {
        videoTrack.stop();
        // Создаём новый стрим без видео
        const newStream = new MediaStream();
        audioTracks.forEach(t => newStream.addTrack(t));
        updateLocalStream(newStream);
        setCameraEnabled(false);
      }
    } else {
      // Включаем камеру
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newVideoTrack = stream.getVideoTracks()[0];
        const newStream = new MediaStream();
        audioTracks.forEach(t => newStream.addTrack(t));
        newStream.addTrack(newVideoTrack);
        updateLocalStream(newStream);
        setCameraEnabled(true);
      } catch (err) {
        console.error('Cannot get camera:', err);
      }
    }
  }, [localStream, cameraEnabled, isScreenSharing, updateLocalStream]);

  // ---- Управление микрофоном ----
  const toggleMic = useCallback(async () => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    const videoTracks = localStream.getVideoTracks();

    if (micEnabled) {
      // Выключаем микрофон
      const audioTrack = audioTracks[0];
      if (audioTrack) {
        audioTrack.stop();
        const newStream = new MediaStream();
        videoTracks.forEach(t => newStream.addTrack(t));
        updateLocalStream(newStream);
        setMicEnabled(false);
      }
    } else {
      // Включаем микрофон
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newAudioTrack = stream.getAudioTracks()[0];
        const newStream = new MediaStream();
        videoTracks.forEach(t => newStream.addTrack(t));
        newStream.addTrack(newAudioTrack);
        updateLocalStream(newStream);
        setMicEnabled(true);
      } catch (err) {
        console.error('Cannot get mic:', err);
      }
    }
  }, [localStream, micEnabled, updateLocalStream]);

  // ---- Демонстрация экрана ----
  const toggleScreenShare = useCallback(async () => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    const videoTracks = localStream.getVideoTracks();

    if (isScreenSharing) {
      // Останавливаем экран
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        setScreenStream(null);
      }
      setIsScreenSharing(false);
      // Возвращаем камеру
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newVideoTrack = stream.getVideoTracks()[0];
        const newStream = new MediaStream();
        audioTracks.forEach(t => newStream.addTrack(t));
        newStream.addTrack(newVideoTrack);
        updateLocalStream(newStream);
        setCameraEnabled(true);
      } catch (err) {
        console.error('Cannot get camera after screen share:', err);
      }
    } else {
      // Запускаем экран
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = stream.getVideoTracks()[0];
        track.onended = () => {
          if (isScreenSharing) {
            toggleScreenShare(); // завершаем при системном окончании
          }
        };
        setScreenStream(stream);
        setIsScreenSharing(true);
        // Создаём новый стрим с экраном вместо видео
        const newStream = new MediaStream();
        audioTracks.forEach(t => newStream.addTrack(t));
        newStream.addTrack(track);
        updateLocalStream(newStream);
        setCameraEnabled(false);
      } catch (err) {
        console.error('Screen share error:', err);
      }
    }
  }, [localStream, isScreenSharing, screenStream, updateLocalStream]);

  // Очистка
  useEffect(() => {
    return () => {
      Object.values(peerConnections.current).forEach(pc => pc.close());
      peerConnections.current = {};
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
      }
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
  };
};