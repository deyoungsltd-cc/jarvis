'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type {
  MissionEvent,
  MissionStatus,
  WsPayload,
} from '@/lib/openjarvis-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SocketLike = any;

interface UseJarvisSocketReturn {
  connected: boolean;
  events: MissionEvent[];
  currentStatus: MissionStatus | null;
  currentMission: Partial<{
    tokenCount: number;
    toolCallCount: number;
    status: MissionStatus;
    error: string | null;
  }> | null;
  subscribe: (missionId: string) => void;
  unsubscribe: (missionId: string) => void;
  subscribedMissionId: string | null;
}

export function useJarvisSocket(): UseJarvisSocketReturn {
  const socketRef = useRef<SocketLike | null>(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [currentStatus, setCurrentStatus] = useState<MissionStatus | null>(null);
  const [currentMission, setCurrentMission] = useState<UseJarvisSocketReturn['currentMission']>(null);
  const [subscribedMissionId, setSubscribedMissionId] = useState<string | null>(null);

  // Cleanup listeners for a given mission
  const cleanupMission = useCallback(
    (missionId: string, socket: SocketLike) => {
      socket.off(`mission:${missionId}:event`);
      socket.off(`mission:${missionId}:status`);
      socket.off(`mission:${missionId}:update`);
    },
    []
  );

  const subscribe = useCallback(
    (missionId: string) => {
      const socket = socketRef.current;
      if (!socket) return;

      // Clean up previous subscription
      if (subscribedMissionId) {
        cleanupMission(subscribedMissionId, socket);
      }

      // Reset state for new mission
      setEvents([]);
      setSubscribedMissionId(missionId);

      socket.on(`mission:${missionId}:event`, (data: WsPayload) => {
        if (data.type === 'mission:event') {
          setEvents((prev) => {
            // Avoid duplicates by id
            if (prev.some((e) => e.id === data.data.id)) return prev;
            return [...prev, data.data];
          });
        }
      });

      socket.on(`mission:${missionId}:status`, (data: WsPayload) => {
        if (data.type === 'mission:status') {
          setCurrentStatus(data.data.status);
          setCurrentMission((prev) => ({ ...prev, ...data.data }));
        }
      });

      socket.on(`mission:${missionId}:update`, (data: WsPayload) => {
        if (data.type === 'mission:update') {
          setCurrentMission((prev) => ({ ...prev, ...data.data }));
          if (data.data.status) {
            setCurrentStatus(data.data.status);
          }
        }
      });
    },
    [subscribedMissionId, cleanupMission]
  );

  const unsubscribe = useCallback(
    (missionId: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      cleanupMission(missionId, socket);
      if (subscribedMissionId === missionId) {
        setSubscribedMissionId(null);
        setEvents([]);
        setCurrentStatus(null);
        setCurrentMission(null);
      }
    },
    [subscribedMissionId, cleanupMission]
  );

  useEffect(() => {
    // Dynamic import: socket.io-client creates a URL at module-eval time
    // which crashes during Next.js SSR prerendering
    let socket: SocketLike | null = null;
    import('socket.io-client').then(({ io }) => {
      socket = io('/?XTransformPort=3002', {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      socketRef.current = socket;
      socket.on('connect', () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', () => setConnected(false));
    });

    return () => {
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  return {
    connected,
    events,
    currentStatus,
    currentMission,
    subscribe,
    unsubscribe,
    subscribedMissionId,
  };
}
