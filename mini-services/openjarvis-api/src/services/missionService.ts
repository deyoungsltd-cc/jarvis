import { db } from '../utils/db.js';
import { badRequest, notFound } from '../utils/errors.js';

// ---- Types ----

export interface CreateMissionInput {
  goal: string;
  owner?: string;
  riskLevel?: string;
  budget?: number;
  maxToolCalls?: number;
}

export interface UpdateMissionInput {
  goal?: string;
  status?: string;
  plan?: unknown;
  riskLevel?: string;
  budget?: number;
  maxToolCalls?: number;
  toolCallCount?: number;
  tokenUsage?: number;
}

// ---- Service ----

export const missionService = {
  /** Create a new mission */
  async create(input: CreateMissionInput, requestId: string) {
    return db.mission.create({
      data: {
        goal: input.goal,
        owner: input.owner || 'default',
        riskLevel: input.riskLevel || 'low',
        budget: input.budget ?? 100000,
        maxToolCalls: input.maxToolCalls ?? 50,
        status: 'draft',
      },
    });
  },

  /** Get a mission by ID */
  async getById(id: string, requestId: string) {
    const mission = await db.mission.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!mission) {
      throw notFound('MISSION_NOT_FOUND', `Mission ${id} not found`, requestId);
    }
    return mission;
  },

  /** List all missions */
  async list(requestId: string) {
    return db.mission.findMany({
      orderBy: { createdAt: 'desc' },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
  },

  /** Update a mission */
  async update(id: string, input: UpdateMissionInput, requestId: string) {
    await this.getById(id, requestId); // throws if not found

    const data: Record<string, unknown> = {};
    if (input.goal !== undefined) data.goal = input.goal;
    if (input.status !== undefined) data.status = input.status;
    if (input.plan !== undefined) data.plan = JSON.stringify(input.plan);
    if (input.riskLevel !== undefined) data.riskLevel = input.riskLevel;
    if (input.budget !== undefined) data.budget = input.budget;
    if (input.maxToolCalls !== undefined) data.maxToolCalls = input.maxToolCalls;
    if (input.toolCallCount !== undefined) data.toolCallCount = input.toolCallCount;
    if (input.tokenUsage !== undefined) data.tokenUsage = input.tokenUsage;

    return db.mission.update({ where: { id }, data });
  },

  /** Delete a mission */
  async remove(id: string, requestId: string) {
    await this.getById(id, requestId);
    return db.mission.delete({ where: { id } });
  },
};
