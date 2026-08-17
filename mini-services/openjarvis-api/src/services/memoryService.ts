import { db } from '../utils/db.js';

export interface CreateMemoryInput {
  scope: 'working' | 'episodic' | 'semantic' | 'preference' | 'project';
  key: string;
  value?: unknown;
}

export const memoryService = {
  /** Store a memory entry */
  async create(input: CreateMemoryInput) {
    return db.memoryEntry.create({
      data: {
        scope: input.scope,
        key: input.key,
        value: input.value !== undefined ? JSON.stringify(input.value) : null,
      },
    });
  },

  /** Get a memory entry by scope + key */
  async get(scope: string, key: string) {
    return db.memoryEntry.findFirst({ where: { scope, key } });
  },

  /** List memories by scope */
  async listByScope(scope: string) {
    return db.memoryEntry.findMany({ where: { scope }, orderBy: { createdAt: 'desc' } });
  },

  /** List all memories */
  async list() {
    return db.memoryEntry.findMany({ orderBy: { createdAt: 'desc' } });
  },

  /** Update a memory entry */
  async update(id: string, value: unknown) {
    return db.memoryEntry.update({
      where: { id },
      data: { value: JSON.stringify(value) },
    });
  },

  /** Delete a memory entry */
  async remove(id: string) {
    return db.memoryEntry.delete({ where: { id } });
  },
};
