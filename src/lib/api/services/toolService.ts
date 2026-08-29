import { db } from '@/lib/api/db';
import { notFound, conflict } from '@/lib/api/errors';

export interface CreateToolInput {
  name: string;
  description: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  riskLevel?: string;
  enabled?: boolean;
}

export const toolService = {
  /** Register a tool */
  async create(input: CreateToolInput, requestId: string) {
    const existing = await db.tool.findUnique({ where: { name: input.name } });
    if (existing) {
      throw conflict('TOOL_EXISTS', `Tool '${input.name}' already exists`, requestId);
    }

    return db.tool.create({
      data: {
        name: input.name,
        description: input.description,
        inputSchema: input.inputSchema !== undefined ? JSON.stringify(input.inputSchema) : null,
        outputSchema: input.outputSchema !== undefined ? JSON.stringify(input.outputSchema) : null,
        riskLevel: input.riskLevel || 'low',
        enabled: input.enabled ?? true,
      },
    });
  },

  /** Get a tool by name */
  async getByName(name: string, requestId: string) {
    const tool = await db.tool.findUnique({ where: { name } });
    if (!tool) {
      throw notFound('TOOL_NOT_FOUND', `Tool '${name}' not found`, requestId);
    }
    return tool;
  },

  /** List all tools */
  async list() {
    return db.tool.findMany({ orderBy: { createdAt: 'asc' } });
  },

  /** Update a tool */
  async update(name: string, input: Partial<CreateToolInput>, requestId: string) {
    await this.getByName(name, requestId);

    const data: Record<string, unknown> = {};
    if (input.description !== undefined) data.description = input.description;
    if (input.inputSchema !== undefined) data.inputSchema = JSON.stringify(input.inputSchema);
    if (input.outputSchema !== undefined) data.outputSchema = JSON.stringify(input.outputSchema);
    if (input.riskLevel !== undefined) data.riskLevel = input.riskLevel;
    if (input.enabled !== undefined) data.enabled = input.enabled;

    return db.tool.update({ where: { name }, data });
  },

  /** Remove a tool */
  async remove(name: string, requestId: string) {
    await this.getByName(name, requestId);
    return db.tool.delete({ where: { name } });
  },
};
