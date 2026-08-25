'use client';

import { useState, useCallback } from 'react';
import type { MissionEvent, MissionStatus } from '@/lib/openjarvis-types';

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

/**
 * Socket.IO stub — returns empty data.
 * Real-time features use polling-based approach instead.
 */
export function useJarvisSocket(): UseJarvisSocketReturn {
  const [subscribedMissionId, setSubscribedMissionId] = useState<string | null>(null);

  const subscribe = useCallback((id: string) => { setSubscribedMissionId(id); }, []);
  const unsubscribe = useCallback((_id: string) => { setSubscribedMissionId(null); }, []);

  return {
    connected: false,
    events: [],
    currentStatus: null,
    currentMission: null,
    subscribe,
    unsubscribe,
    subscribedMissionId,
  };
}
