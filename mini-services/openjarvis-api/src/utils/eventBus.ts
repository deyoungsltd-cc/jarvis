import type { Server } from 'socket.io';

let io: Server | null = null;

export function setSocketIO(server: Server) {
  io = server;
}

/**
 * Emit a mission event to all subscribers.
 * Called by missionEventService after each DB write.
 */
export function emitMissionEvent(missionId: string, event: {
  id: string;
  type: string;
  payload: unknown;
  createdAt: Date;
}) {
  if (!io) return;
  io.emit(`mission:${missionId}:event`, {
    ...event,
    payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
  });
}

/** Emit a mission status change */
export function emitMissionStatus(missionId: string, status: string) {
  if (!io) return;
  io.emit(`mission:${missionId}:status`, { missionId, status });
}

/** Emit a mission update (any field change) */
export function emitMissionUpdate(missionId: string, data: Record<string, unknown>) {
  if (!io) return;
  io.emit(`mission:${missionId}:update`, { missionId, ...data });
}

/** Phase 10: Emit approval events to subscribers */
export const eventBus = {
  emit(event: string, data: Record<string, unknown>) {
    if (!io) return;

    if (event === 'approval:created' || event === 'approval:resolved') {
      const missionId = data.missionId as string;
      // Broadcast to global approval subscribers
      io.to('approvals:all').emit(event, { ...data, timestamp: new Date().toISOString() });
      // Broadcast to mission-specific approval subscribers
      if (missionId) {
        io.to(`approvals:mission:${missionId}`).emit(event, { ...data, timestamp: new Date().toISOString() });
      }
    }

    // Phase 16: Service lifecycle events
    if (event.startsWith('service:')) {
      io.to('services:all').emit(event, { ...data, timestamp: new Date().toISOString() });
    }

    // Wake word events: broadcast to all wake-word subscribers
    if (event.startsWith('wake-word:')) {
      io.to('wake-word:all').emit(event, { ...data, timestamp: new Date().toISOString() });
    }
  },
};
