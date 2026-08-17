/**
 * Memory Context Builder — Phase 6
 *
 * Builds a formatted context string from relevant memories
 * for injection into the agent's system prompt.
 * Called during the context_retrieval stage of the agent loop.
 */
import { memoryService, type MemoryScope, type SearchResult } from '../../services/memoryService.js';
import { logger } from '../../utils/logger.js';

export interface ContextBuildOptions {
  goal: string;
  missionId?: string;
  scopes?: MemoryScope[];
  maxTokens?: number;
  maxEntries?: number;
  requestId?: string;
}

export interface BuiltContext {
  /** The formatted context block ready for injection */
  contextString: string;
  /** How many memories were included */
  entryCount: number;
  /** Which memories were used (for audit trail) */
  memoryIds: string[];
  /** Total approximate character length of the context */
  charLength: number;
}

/**
 * Build a context block from relevant memories.
 *
 * The context is injected into the system prompt so the agent
 * can leverage past learnings, user preferences, and project knowledge.
 */
export async function buildMemoryContext(options: ContextBuildOptions): Promise<BuiltContext> {
  const {
    goal,
    missionId,
    scopes = ['semantic', 'preference', 'episodic', 'project'],
    maxTokens = 2000,
    maxEntries = 10,
    requestId = '-',
  } = options;

  // Approximate: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4;

  // 1. Recall relevant memories by goal
  const results: SearchResult[] = await memoryService.recallForContext(goal, {
    scopes,
    limit: maxEntries * 2, // Over-fetch, then trim by size
  });

  // 2. If a missionId is given, also fetch mission-specific memories
  if (missionId) {
    const missionMemories = await memoryService.listByMission(missionId);
    for (const mem of missionMemories) {
      const alreadyIncluded = results.some(r => r.id === mem.id);
      if (!alreadyIncluded) {
        const tags = mem.tags ? (typeof mem.tags === 'string' ? JSON.parse(mem.tags) : mem.tags) : [];
        results.push({
          id: mem.id,
          scope: mem.scope,
          key: mem.key,
          value: mem.value ? (() => { try { return JSON.parse(mem.value); } catch { return mem.value; } })() : null,
          tags: Array.isArray(tags) ? tags : [],
          importance: mem.importance,
          source: mem.source,
          missionId: mem.missionId || undefined,
          createdAt: mem.createdAt,
          score: mem.importance / 5, // Use importance as baseline score
        });
      }
    }
  }

  // 3. Sort by combined score (relevance + importance)
  results.sort((a, b) => b.score - a.score);

  // 4. Build the context string, respecting size limits
  const memoryIds: string[] = [];
  const sections: string[] = [];
  let totalChars = 0;

  // Group by scope for organized output
  const scopeLabels: Record<string, string> = {
    semantic: 'Knowledge & Facts',
    preference: 'User Preferences',
    episodic: 'Past Experiences',
    project: 'Project Context',
    working: 'Working Memory',
  };

  const grouped = new Map<string, SearchResult[]>();
  for (const r of results) {
    if (!grouped.has(r.scope)) grouped.set(r.scope, []);
    grouped.get(r.scope)!.push(r);
  }

  for (const [scope, entries] of grouped) {
    const scopeHeader = `### ${scopeLabels[scope] || scope}`;
    const scopeEntries: string[] = [];

    for (const entry of entries) {
      if (memoryIds.length >= maxEntries) break;

      const valueStr = formatValue(entry.value);
      const entryText = `- **${entry.key}**${entry.tags.length > 0 ? ` (${entry.tags.join(', ')})` : ''}: ${valueStr}`;

      if (totalChars + entryText.length > maxChars) continue;

      scopeEntries.push(entryText);
      memoryIds.push(entry.id);
      totalChars += entryText.length;

      // Touch the memory (increment access count)
      memoryService.touch(entry.id).catch(() => {});
    }

    if (scopeEntries.length > 0) {
      sections.push(`${scopeHeader}\n${scopeEntries.join('\n')}`);
    }
  }

  if (sections.length === 0) {
    return {
      contextString: '',
      entryCount: 0,
      memoryIds: [],
      charLength: 0,
    };
  }

  const contextString = `<memory-context>\n${sections.join('\n\n')}\n</memory-context>`;

  logger.info(requestId, `Memory context built: ${memoryIds.length} entries, ${totalChars} chars`);

  return {
    contextString,
    entryCount: memoryIds.length,
    memoryIds,
    charLength: totalChars,
  };
}

/**
 * Format a value for inclusion in the context string.
 * Truncates long values to keep context compact.
 */
function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '(empty)';
  if (typeof val === 'string') {
    return val.length > 200 ? val.slice(0, 200) + '...' : val;
  }
  try {
    const s = JSON.stringify(val);
    return s.length > 200 ? s.slice(0, 200) + '...' : s;
  } catch {
    return String(val);
  }
}
