/**
 * Memory Tools — Phase 6
 *
 * Agent-callable tools for memory operations.
 * These are registered in the tool registry and presented to the model.
 */
import type { ToolHandler } from '../types.js';
import { memoryService, VALID_SCOPES } from '../../services/memoryService.js';

/**
 * Create all memory tool handlers.
 */
export function createMemoryTools(): ToolHandler[] {
  return [
    memoryStoreTool,
    memoryRecallTool,
    memorySearchTool,
    memoryForgetTool,
  ];
}

// =================================================================
// memory_store — Store a new memory
// =================================================================
const memoryStoreTool: ToolHandler = {
  name: 'memory_store',
  description: 'Store information in memory for later recall. Use this to remember facts, preferences, or learnings from the current mission.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: VALID_SCOPES,
        description: 'Memory scope: working (temporary), episodic (past events), semantic (facts/knowledge), preference (user preferences), project (project context)',
      },
      key: {
        type: 'string',
        description: 'A short, descriptive key for this memory (e.g., "user_name", "project_tech_stack", "learned_api_format")',
      },
      value: {
        description: 'The value to store — can be a string, number, object, or array',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for categorization and search (e.g., ["python", "debugging", "api"])',
      },
      importance: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
        description: 'Importance level 1-5. 5 = critical, 1 = low priority. Default: 3',
      },
    },
    required: ['scope', 'key'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      scope: { type: 'string' },
      key: { type: 'string' },
      stored: { type: 'boolean' },
    },
  },
  riskLevel: 'low',
  async execute(input) {
    const start = Date.now();
    try {
      const { scope, key, value, tags, importance } = input as any;
      const entry = await memoryService.create({
        scope,
        key,
        value: value ?? null,
        tags: tags || undefined,
        importance: importance || 3,
        source: 'agent',
      });
      return {
        success: true,
        output: {
          id: entry.id,
          scope: entry.scope,
          key: entry.key,
          stored: true,
        },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: null,
        error: err.message,
        durationMs: Date.now() - start,
      };
    }
  },
};

// =================================================================
// memory_recall — Recall a specific memory by key
// =================================================================
const memoryRecallTool: ToolHandler = {
  name: 'memory_recall',
  description: 'Recall a specific memory by its key and scope. Use this when you need to retrieve a known fact or preference.',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'The memory key to recall' },
      scope: { type: 'string', enum: VALID_SCOPES, description: 'The scope to search in. Omit to search all scopes.' },
    },
    required: ['key'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      found: { type: 'boolean' },
      memory: { type: 'object' },
    },
  },
  riskLevel: 'low',
  async execute(input) {
    const start = Date.now();
    try {
      const { key, scope } = input as any;
      let entry;
      if (scope) {
        entry = await memoryService.get(scope, key);
      } else {
        // Search all scopes
        for (const s of VALID_SCOPES) {
          entry = await memoryService.get(s, key);
          if (entry) break;
        }
      }

      if (!entry) {
        return {
          success: true,
          output: { found: false, key, scope: scope || 'all' },
          durationMs: Date.now() - start,
        };
      }

      // Touch to record access
      await memoryService.touch(entry.id);

      return {
        success: true,
        output: {
          found: true,
          id: entry.id,
          scope: entry.scope,
          key: entry.key,
          value: entry.value ? (() => { try { return JSON.parse(entry.value); } catch { return entry.value; } })() : null,
          tags: entry.tags ? JSON.parse(entry.tags) : [],
          importance: entry.importance,
          accessCount: entry.accessCount + 1,
        },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: null,
        error: err.message,
        durationMs: Date.now() - start,
      };
    }
  },
};

// =================================================================
// memory_search — Search memories by keyword
// =================================================================
const memorySearchTool: ToolHandler = {
  name: 'memory_search',
  description: 'Search memories by keywords. Returns relevant memories matching the query across key, value, and tags. Use this when you need to find related past information.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query — keywords to match against memory keys, values, and tags' },
      scope: { type: 'string', enum: VALID_SCOPES, description: 'Restrict search to a specific scope' },
      limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Max results to return (default: 10)' },
    },
    required: ['query'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      results: { type: 'array' },
      count: { type: 'integer' },
    },
  },
  riskLevel: 'low',
  async execute(input) {
    const start = Date.now();
    try {
      const { query, scope, limit } = input as any;
      const results = await memoryService.search(query, {
        scope,
        limit: limit || 10,
      });

      // Touch accessed memories
      for (const r of results) {
        memoryService.touch(r.id).catch(() => {});
      }

      return {
        success: true,
        output: {
          results: results.map(r => ({
            id: r.id,
            scope: r.scope,
            key: r.key,
            value: r.value,
            tags: r.tags,
            importance: r.importance,
            score: r.score,
          })),
          count: results.length,
        },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: null,
        error: err.message,
        durationMs: Date.now() - start,
      };
    }
  },
};

// =================================================================
// memory_forget — Delete a memory
// =================================================================
const memoryForgetTool: ToolHandler = {
  name: 'memory_forget',
  description: 'Delete a specific memory by ID. Use this to remove outdated, incorrect, or no-longer-relevant information from memory.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The ID of the memory entry to delete' },
    },
    required: ['id'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      deleted: { type: 'boolean' },
      id: { type: 'string' },
    },
  },
  riskLevel: 'low',
  async execute(input) {
    const start = Date.now();
    try {
      const { id } = input as any;
      await memoryService.remove(id);
      return {
        success: true,
        output: { deleted: true, id },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: null,
        error: err.message,
        durationMs: Date.now() - start,
      };
    }
  },
};
