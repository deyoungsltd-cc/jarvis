import { db } from '@/lib/api/db';
import { notFound } from '@/lib/api/errors';
import { emitMissionEvent } from '@/lib/api/event-bus';

export interface CreateEventInput {
  missionId: string;
  type: string;
  payload?: unknown;
}

export const missionEventService = {
  /** Record a mission event and broadcast via WebSocket */
  async create(input: CreateEventInput, requestId: string) {
    const mission = await db.mission.findUnique({ where: { id: input.missionId } });
    if (!mission) {
      throw notFound('MISSION_NOT_FOUND', `Mission ${input.missionId} not found`, requestId);
    }

    const event = await db.missionEvent.create({
      data: {
        missionId: input.missionId,
        type: input.type,
        payload: input.payload !== undefined ? JSON.stringify(input.payload) : null,
      },
    });

    // Broadcast to WebSocket subscribers
    emitMissionEvent(input.missionId, event);

    return event;
  },

  /** List events for a mission */
  async listByMission(missionId: string, requestId: string) {
    const mission = await db.mission.findUnique({ where: { id: missionId } });
    if (!mission) {
      throw notFound('MISSION_NOT_FOUND', `Mission ${missionId} not found`, requestId);
    }

    return db.missionEvent.findMany({
      where: { missionId },
      orderBy: { createdAt: 'asc' },
    });
  },
};
