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
