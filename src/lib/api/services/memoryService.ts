/**
 * Enhanced Memory Service — Phase 6
 *
 * Provides the full memory lifecycle: create, read, update, delete,
 * search, recall, consolidation, expiry, stats, and associations.
 */
import { db } from '@/lib/api/db';
import { logger } from '@/lib/api/logger';

export type MemoryScope = 'working' | 'episodic' | 'semantic' | 'preference' | 'project';
export type MemorySource = 'agent' | 'user' | 'system' | 'import';

export interface CreateMemoryInput {
  scope: MemoryScope;
  key: string;
  value?: unknown;
  tags?: string[];
  missionId?: string;
  source?: MemorySource;
  importance?: number; // 1-5
  expiresAt?: Date;
}

export interface UpdateMemoryInput {
  value?: unknown;
  tags?: string[];
  importance?: number;
  expiresAt?: Date | null;
}

export interface SearchResult {
  id: string;
  scope: string;
  key: string;
  value: unknown;
  tags: string[];
  importance: number;
  source: string;
  missionId?: string;
  createdAt: Date;
  score: number;
}

export interface MemoryStats {
  totalEntries: number;
  byScope: Record<string, number>;
  byImportance: Record<number, number>;
  bySource: Record<string, number>;
  expiredCount: number;
  averageAccessCount: number;
}

export const VALID_SCOPES: MemoryScope[] = ['working', 'episodic', 'semantic', 'preference', 'project'];
export const VALID_SOURCES: MemorySource[] = ['agent', 'user', 'system', 'import'];

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseValue(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export const memoryService = {
  /** Store a memory entry */
  async create(input: CreateMemoryInput) {
    if (!VALID_SCOPES.includes(input.scope)) {
      throw new Error(`Invalid scope: ${input.scope}. Must be one of: ${VALID_SCOPES.join(', ')}`);
    }
    if (input.importance !== undefined && (input.importance < 1 || input.importance > 5)) {
      throw new Error('Importance must be between 1 and 5');
    }

    return db.memoryEntry.create({
      data: {
        scope: input.scope,
        key: input.key,
        value: input.value !== undefined ? JSON.stringify(input.value) : null,
        tags: input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null,
        missionId: input.missionId || null,
        source: input.source || 'agent',
        importance: input.importance ?? 3,
        expiresAt: input.expiresAt || null,
      },
    });
  },

  /** Get a memory entry by id */
  async getById(id: string) {
    return db.memoryEntry.findUnique({ where: { id } });
  },

  /** Get a memory entry by scope + key */
  async get(scope: string, key: string) {
    return db.memoryEntry.findFirst({ where: { scope, key } });
  },

  /** List memories by scope */
  async listByScope(scope: string) {
    return db.memoryEntry.findMany({
      where: { scope },
      orderBy: { importance: 'desc' },
    });
  },

  /** List all memories */
  async list() {
    return db.memoryEntry.findMany({
      orderBy: { updatedAt: 'desc' },
    });
  },

  /** List memories by missionId */
  async listByMission(missionId: string) {
    return db.memoryEntry.findMany({
      where: { missionId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Update a memory entry */
  async update(id: string, input: UpdateMemoryInput) {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (input.value !== undefined) data.value = JSON.stringify(input.value);
    if (input.tags !== undefined) data.tags = input.tags.length > 0 ? JSON.stringify(input.tags) : null;
    if (input.importance !== undefined) data.importance = input.importance;
    if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt;

    return db.memoryEntry.update({
      where: { id },
      data,
    });
  },

  /** Delete a memory entry */
  async remove(id: string) {
    return db.memoryEntry.delete({ where: { id } });
  },

  /** Bulk delete by ids */
  async bulkRemove(ids: string[]): Promise<number> {
    const result = await db.memoryEntry.deleteMany({
      where: { id: { in: ids } },
    });
    return result.count;
  },

  /** Delete all memories in a scope */
  async removeByScope(scope: string): Promise<number> {
    const result = await db.memoryEntry.deleteMany({ where: { scope } });
    return result.count;
  },

  /**
   * Increment accessCount and set lastAccessedAt.
   * Called every time a memory is recalled/read by the agent.
   */
  async touch(id: string): Promise<void> {
    await db.memoryEntry.update({
      where: { id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });
  },

  /**
   * Search memories by query text.
   * Uses keyword matching against key, value, and tags.
   * Returns results sorted by relevance score.
   */
  async search(query: string, options?: {
    scope?: string;
    limit?: number;
    minImportance?: number;
    tags?: string[];
  }): Promise<SearchResult[]> {
    const limit = options?.limit || 20;
    const minImportance = options?.minImportance || 0;
    const now = new Date();

    // Build where clause
    const where: Record<string, unknown> = {};
    if (options?.scope) where.scope = options.scope;
    if (options?.tags && options.tags.length > 0) {
      // For tags, we need to find entries whose tags JSON array overlaps
      where.tags = { not: null as any };
    }

    const entries = await db.memoryEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit * 3, // Over-fetch, then rank
    });

    // Filter out expired entries in application layer (SQLite compatibility)
    const activeEntries = entries.filter(e => !e.expiresAt || e.expiresAt > now);

    // Tokenize the query for matching
    const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    const results: SearchResult[] = [];

    for (const entry of activeEntries) {
      if (entry.importance < minImportance) continue;

      const tags = parseTags(entry.tags);
      // Filter by tag overlap if requested
      if (options?.tags && options.tags.length > 0) {
        const hasOverlap = options.tags.some(t => tags.includes(t));
        if (!hasOverlap) continue;
      }

      // Compute text-relevance score (0-1)
      let textScore = 0;
      const keyLower = entry.key.toLowerCase();
      const valueLower = (entry.value || '').toLowerCase();
      const queryLower = query.toLowerCase();

      // Exact key match
      if (keyLower === queryLower) textScore += 0.5;
      // Key contains query
      else if (keyLower.includes(queryLower)) textScore += 0.3;

      // Value contains query
      if (valueLower.includes(queryLower)) textScore += 0.2;

      // Token-level matching
      for (const token of queryTokens) {
        if (keyLower.includes(token)) textScore += 0.15;
        if (valueLower.includes(token)) textScore += 0.1;
        if (tags.some(t => t.toLowerCase().includes(token))) textScore += 0.2;
      }

      // Skip entries with no text relevance
      if (textScore === 0) continue;

      // Add boost scores
      let score = textScore;

      // Recency bonus (more recent = higher, normalized to 0-0.1)
      const ageMs = Date.now() - entry.createdAt.getTime();
      const recencyBonus = Math.max(0, 0.1 - (ageMs / (30 * 24 * 60 * 60 * 1000)) * 0.1);
      score += recencyBonus;

      // Access frequency bonus (normalized to 0-0.1)
      const accessBonus = Math.min(0.1, (entry.accessCount / 20) * 0.1);
      score += accessBonus;

      // Importance bonus (normalized to 0-0.15)
      const importanceBonus = (entry.importance / 5) * 0.15;
      score += importanceBonus;

      if (score > 0) {
        results.push({
          id: entry.id,
          scope: entry.scope,
          key: entry.key,
          value: parseValue(entry.value),
          tags,
          importance: entry.importance,
          source: entry.source,
          missionId: entry.missionId || undefined,
          createdAt: entry.createdAt,
          score: Math.min(score, 1.0),
        });
      }
    }

    // Sort by score descending, take top N
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  },

  /**
   * Recall memories relevant to a goal/context.
   * Used by the agent loop's context_retrieval stage.
   */
  async recallForContext(goal: string, options?: {
    scopes?: MemoryScope[];
    limit?: number;
  }): Promise<SearchResult[]> {
    const scopes = options?.scopes || ['semantic', 'preference', 'episodic', 'project'];
    // Search each scope and merge results
    const allResults: SearchResult[] = [];
    for (const scope of scopes) {
      const results = await this.search(goal, {
        scope,
        limit: options?.limit || 10,
      });
      allResults.push(...results);
    }
    // Deduplicate by id and sort by score
    const seen = new Set<string>();
    const deduped: SearchResult[] = [];
    for (const r of allResults) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        deduped.push(r);
      }
    }
    deduped.sort((a, b) => b.score - a.score);
    return deduped.slice(0, options?.limit || 10);
  },

  /**
   * Consolidate (merge) duplicate or similar memories.
   * Finds memories with the same scope+key and keeps the most recent,
   * creating an association link from the old to the new.
   */
  async consolidate(requestId?: string): Promise<{ merged: number }> {
    const entries = await db.memoryEntry.findMany({
      orderBy: { createdAt: 'asc' },
    });

    // Group by scope+key
    const groups = new Map<string, typeof entries>();
    for (const entry of entries) {
      const groupKey = `${entry.scope}:${entry.key}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(entry);
    }

    let merged = 0;
    for (const [_, group] of groups) {
      if (group.length <= 1) continue;

      // Keep the most recent, archive the rest
      const keeper = group[group.length - 1];
      const others = group.slice(0, -1);

      for (const old of others) {
        // Create association from old to new
        try {
          await db.memoryAssociation.create({
            data: {
              fromMemoryId: old.id,
              toMemoryId: keeper.id,
              strength: 1.0,
            },
          }).catch(() => {}); // Ignore unique constraint violations

          // Delete the old entry
          await db.memoryEntry.delete({ where: { id: old.id } });
          merged++;
        } catch (err) {
          logger.warn(requestId || '-', `Consolidation failed for ${old.id}: ${err}`);
        }
      }
    }

    return { merged };
  },

  /**
   * Purge expired memories.
   */
  async purgeExpired(): Promise<number> {
    const now = new Date();
    const result = await db.memoryEntry.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  },

  /**
   * Get memory statistics.
   */
  async getStats(): Promise<MemoryStats> {
    const allEntries = await db.memoryEntry.findMany();
    const now = new Date();

    const byScope: Record<string, number> = {};
    const byImportance: Record<number, number> = {};
    const bySource: Record<string, number> = {};
    let expiredCount = 0;
    let totalAccessCount = 0;

    for (const entry of allEntries) {
      byScope[entry.scope] = (byScope[entry.scope] || 0) + 1;
      byImportance[entry.importance] = (byImportance[entry.importance] || 0) + 1;
      bySource[entry.source] = (bySource[entry.source] || 0) + 1;
      if (entry.expiresAt && entry.expiresAt < now) expiredCount++;
      totalAccessCount += entry.accessCount;
    }

    return {
      totalEntries: allEntries.length,
      byScope,
      byImportance,
      bySource,
      expiredCount,
      averageAccessCount: allEntries.length > 0
        ? Math.round((totalAccessCount / allEntries.length) * 100) / 100
        : 0,
    };
  },

  /**
   * Create an association between two memory entries.
   */
  async createAssociation(fromId: string, toId: string, strength?: number) {
    if (fromId === toId) throw new Error('Cannot associate a memory with itself');
    return db.memoryAssociation.create({
      data: {
        fromMemoryId: fromId,
        toMemoryId: toId,
        strength: strength ?? 1.0,
      },
    });
  },

  /**
   * Get associated memories for a given memory entry.
   */
  async getAssociated(id: string, direction?: 'from' | 'to'): Promise<Array<{
    id: string;
    associatedId: string;
    strength: number;
    associatedMemory: {
      id: string;
      scope: string;
      key: string;
      value: string | null;
    } | null;
  }>> {
    const where = direction === 'from'
      ? { fromMemoryId: id }
      : direction === 'to'
        ? { toMemoryId: id }
        : {
            OR: [
              { fromMemoryId: id },
              { toMemoryId: id },
            ],
          };

    const associations = await db.memoryAssociation.findMany({
      where,
      include: {
        from: { select: { id: true, scope: true, key: true, value: true } },
        to: { select: { id: true, scope: true, key: true, value: true } },
      },
    });

    return associations.map(a => ({
      id: a.id,
      associatedId: a.fromMemoryId === id ? a.toMemoryId : a.fromMemoryId,
      strength: a.strength,
      associatedMemory: a.fromMemoryId === id ? a.to : a.from,
    }));
  },
};
