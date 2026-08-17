import { db } from '../utils/db.js';
import { notFound } from '../utils/errors.js';

export interface CreateEventInput {
  missionId: string;
  type: string;
  payload?: unknown;
}

export const missionEventService = {
  /** Record a mission event */
  async create(input: CreateEventInput, requestId: string) {
    // Verify mission exists
    const mission = await db.mission.findUnique({ where: { id: input.missionId } });
    if (!mission) {
      throw notFound('MISSION_NOT_FOUND', `Mission ${input.missionId} not found`, requestId);
    }

    return db.missionEvent.create({
      data: {
        missionId: input.missionId,
        type: input.type,
        payload: input.payload !== undefined ? JSON.stringify(input.payload) : null,
      },
    });
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
