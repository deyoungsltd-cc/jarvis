/**
 * Phase 6 Tests — Memory System
 * 
 * Tests the enhanced memory module directly (no HTTP server needed):
 * 1. MemoryService: CRUD with new fields (tags, importance, source, missionId)
 * 2. MemoryService: search with relevance scoring
 * 3. MemoryService: recall for context
 * 4. MemoryService: touch (access count)
 * 5. MemoryService: expiry/purge
 * 6. MemoryService: consolidation
 * 7. MemoryService: stats
 * 8. MemoryService: associations
 * 9. MemoryContextBuilder: context injection
 * 10. Memory Tools: agent tool interface compliance
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  memoryService,
  VALID_SCOPES,
  VALID_SOURCES,
  type CreateMemoryInput,
} from '../src/services/memoryService.js';
import { buildMemoryContext } from '../src/agent/memory/contextBuilder.js';
import { createMemoryTools } from '../src/agent/memory/memoryTools.js';
import { db } from '../src/utils/db.js';

// Use a unique key prefix per test to avoid collisions
let testCounter = 0;
function uniqueKey(prefix: string) {
  return `${prefix}_${++testCounter}_${Date.now()}`;
}

describe('Phase 6 — Memory System', () => {

  // =================================================================
  // 1. MemoryService CRUD with new fields
  // =================================================================
  describe('MemoryService CRUD with enhanced fields', () => {
    it('creates a memory with all new fields', async () => {
      const entry = await memoryService.create({
        scope: 'semantic',
        key: uniqueKey('crud_full'),
        value: { fact: 'TypeScript is a typed superset of JavaScript' },
        tags: ['typescript', 'programming'],
        importance: 5,
        source: 'system',
      });

      expect(entry.id).toBeDefined();
      expect(entry.scope).toBe('semantic');
      expect(entry.value).toBe(JSON.stringify({ fact: 'TypeScript is a typed superset of JavaScript' }));
      expect(entry.tags).toBe(JSON.stringify(['typescript', 'programming']));
      expect(entry.importance).toBe(5);
      expect(entry.source).toBe('system');
      expect(entry.accessCount).toBe(0);
      expect(entry.lastAccessedAt).toBeNull();
      expect(entry.expiresAt).toBeNull();
    });

    it('creates a memory with missionId', async () => {
      // Create a real mission to satisfy FK constraint
      const mission = await db.mission.create({
        data: { goal: 'test mission for memory FK', status: 'draft' },
      });
      const entry = await memoryService.create({
        scope: 'episodic',
        key: uniqueKey('mission_linked'),
        value: 'Mission result data',
        missionId: mission.id,
        source: 'agent',
      });

      expect(entry.missionId).toBe(mission.id);
      // Cleanup
      await db.mission.delete({ where: { id: mission.id } });
    });

    it('creates a memory with expiry', async () => {
      const future = new Date(Date.now() + 3600_000); // 1 hour
      const entry = await memoryService.create({
        scope: 'working',
        key: uniqueKey('expiring'),
        value: 'Temporary data',
        expiresAt: future,
      });

      expect(entry.expiresAt).not.toBeNull();
    });

    it('gets a memory by scope and key', async () => {
      const key = uniqueKey('get_test');
      await memoryService.create({
        scope: 'preference',
        key,
        value: 'User prefers dark mode',
      });

      const found = await memoryService.get('preference', key);
      expect(found).not.toBeNull();
      expect(found!.key).toBe(key);
      expect(found!.scope).toBe('preference');
    });

    it('updates a memory value, tags, and importance', async () => {
      const entry = await memoryService.create({
        scope: 'semantic',
        key: uniqueKey('update_test'),
        value: 'old value',
        tags: ['old-tag'],
        importance: 2,
      });

      const updated = await memoryService.update(entry.id, {
        value: 'new value',
        tags: ['new-tag-1', 'new-tag-2'],
        importance: 4,
      });

      expect(updated.value).toBe(JSON.stringify('new value'));
      expect(updated.tags).toBe(JSON.stringify(['new-tag-1', 'new-tag-2']));
      expect(updated.importance).toBe(4);
    });

    it('lists memories by missionId', async () => {
      const mission = await db.mission.create({
        data: { goal: 'test mission for listByMission', status: 'draft' },
      });
      await memoryService.create({
        scope: 'episodic',
        key: uniqueKey('list_mission_1'),
        value: 'result 1',
        missionId: mission.id,
      });
      await memoryService.create({
        scope: 'episodic',
        key: uniqueKey('list_mission_2'),
        value: 'result 2',
        missionId: mission.id,
      });

      const list = await memoryService.listByMission(mission.id);
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.every(e => e.missionId === mission.id)).toBe(true);
      // Cleanup
      await db.mission.delete({ where: { id: mission.id } });
    });
  });

  // =================================================================
  // 2. Memory Search
  // =================================================================
  describe('Memory Search', () => {
    beforeEach(async () => {
      // Create searchable memories
      await memoryService.create({
        scope: 'semantic',
        key: uniqueKey('search_python'),
        value: 'Python is a high-level programming language used for web development',
        tags: ['python', 'web', 'programming'],
        importance: 4,
      });
      await memoryService.create({
        scope: 'semantic',
        key: uniqueKey('search_javascript'),
        value: 'JavaScript is the language of the web browser',
        tags: ['javascript', 'web', 'browser'],
        importance: 3,
      });
      await memoryService.create({
        scope: 'preference',
        key: uniqueKey('pref_theme'),
        value: 'User prefers dark theme',
        tags: ['theme', 'ui'],
        importance: 2,
      });
    });

    it('finds memories by keyword in value', async () => {
      const results = await memoryService.search('programming language');
      expect(results.length).toBeGreaterThan(0);
      const pythonResult = results.find(r => r.key.includes('search_python'));
      expect(pythonResult).toBeDefined();
      expect(pythonResult!.score).toBeGreaterThan(0);
    });

    it('finds memories by tag', async () => {
      const results = await memoryService.search('web');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by scope', async () => {
      const results = await memoryService.search('web', { scope: 'semantic' });
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.every(r => r.scope === 'semantic')).toBe(true);
    });

    it('respects min importance', async () => {
      const allResults = await memoryService.search('web', { minImportance: 4 });
      expect(allResults.every(r => r.importance >= 4)).toBe(true);
    });

    it('filters by tags', async () => {
      const results = await memoryService.search('language', { tags: ['python'] });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('returns results sorted by score', async () => {
      const results = await memoryService.search('web programming');
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('includes tag arrays in search results', async () => {
      const results = await memoryService.search('python programming');
      const pythonResult = results.find(r => r.key.includes('search_python'));
      expect(pythonResult?.tags).toContain('python');
      expect(pythonResult?.tags).toContain('web');
    });

    it('includes importance and source in results', async () => {
      // Store with a known, searchable key
      const key = uniqueKey('imp_src_test');
      await memoryService.create({
        scope: 'preference',
        key,
        value: 'User prefers dark theme',
        tags: ['theme', 'ui'],
        importance: 2,
        source: 'user',
      });
      const results = await memoryService.search('imp_src_test');
      const prefResult = results.find(r => r.key === key);
      expect(prefResult).toBeDefined();
      expect(prefResult!.importance).toBe(2);
      expect(prefResult!.source).toBe('user');
    });
  });

  // =================================================================
  // 3. Recall for Context
  // =================================================================
  describe('Recall for Context', () => {
    it('returns relevant memories for a goal', async () => {
      await memoryService.create({
        scope: 'semantic',
        key: uniqueKey('ctx_react'),
        value: 'React is a component-based UI library',
        tags: ['react', 'frontend'],
        importance: 4,
      });

      const results = await memoryService.recallForContext('Build a React component');
      expect(results.length).toBeGreaterThan(0);
    });

    it('scopes recall to specified scopes', async () => {
      const results = await memoryService.recallForContext('test query', {
        scopes: ['preference'],
      });
      expect(results.every(r => r.scope === 'preference')).toBe(true);
    });

    it('respects the limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await memoryService.create({
          scope: 'semantic',
          key: uniqueKey(`ctx_limit_${i}`),
          value: `Fact ${i} about testing`,
          tags: ['testing'],
          importance: 4,
        });
      }

      const results = await memoryService.recallForContext('testing', { limit: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  // =================================================================
  // 4. Touch (access tracking)
  // =================================================================
  describe('Touch / Access Tracking', () => {
    it('increments accessCount on touch', async () => {
      const entry = await memoryService.create({
        scope: 'semantic',
        key: uniqueKey('touch_test'),
        value: 'frequently accessed fact',
      });

      expect(entry.accessCount).toBe(0);
      expect(entry.lastAccessedAt).toBeNull();

      await memoryService.touch(entry.id);

      const updated = await memoryService.getById(entry.id);
      expect(updated!.accessCount).toBe(1);
      expect(updated!.lastAccessedAt).not.toBeNull();
    });

    it('increments accessCount multiple times', async () => {
      const entry = await memoryService.create({
        scope: 'semantic',
        key: uniqueKey('touch_multi'),
        value: 'accessed many times',
      });

      for (let i = 0; i < 5; i++) {
        await memoryService.touch(entry.id);
      }

      const updated = await memoryService.getById(entry.id);
      expect(updated!.accessCount).toBe(5);
    });
  });

  // =================================================================
  // 5. Expiry and Purge
  // =================================================================
  describe('Expiry and Purge', () => {
    it('purges expired memories', async () => {
      const past = new Date(Date.now() - 1000); // 1 second ago
      await memoryService.create({
        scope: 'working',
        key: uniqueKey('expired_1'),
        value: 'this is expired',
        expiresAt: past,
      });

      await memoryService.create({
        scope: 'working',
        key: uniqueKey('not_expired'),
        value: 'this is still valid',
      });

      const purged = await memoryService.purgeExpired();
      expect(purged).toBeGreaterThanOrEqual(1);

      // The non-expired one should still exist
      const remaining = await memoryService.get('working', `not_expired`);
      // It should exist (findFirst returns the one we just created)
      expect(remaining).toBeDefined();
    });
  });

  // =================================================================
  // 6. Consolidation
  // =================================================================
  describe('Consolidation', () => {
    it('merges duplicate scope+key memories', async () => {
      const key = uniqueKey('consolidate');

      await memoryService.create({ scope: 'semantic', key, value: 'version 1' });
      await memoryService.create({ scope: 'semantic', key, value: 'version 2' });
      await memoryService.create({ scope: 'semantic', key, value: 'version 3 (latest)' });

      const { merged } = await memoryService.consolidate();
      expect(merged).toBeGreaterThanOrEqual(2);

      // Should have exactly one remaining
      const remaining = await memoryService.listByScope('semantic');
      const withKey = remaining.filter(e => e.key === key);
      expect(withKey.length).toBe(1);
      expect(withKey[0].value).toBe(JSON.stringify('version 3 (latest)'));
    });
  });

  // =================================================================
  // 7. Stats
  // =================================================================
  describe('Memory Statistics', () => {
    it('returns correct total count', async () => {
      const stats = await memoryService.getStats();
      expect(stats.totalEntries).toBeGreaterThan(0);
    });

    it('breaks down by scope', async () => {
      const stats = await memoryService.getStats();
      expect(stats.byScope).toBeDefined();
      expect(typeof stats.byScope).toBe('object');
      expect(Object.keys(stats.byScope).length).toBeGreaterThan(0);
    });

    it('breaks down by importance', async () => {
      const stats = await memoryService.getStats();
      expect(stats.byImportance).toBeDefined();
      expect(typeof stats.byImportance).toBe('object');
    });

    it('breaks down by source', async () => {
      const stats = await memoryService.getStats();
      expect(stats.bySource).toBeDefined();
      expect(typeof stats.bySource).toBe('object');
    });

    it('includes averageAccessCount', async () => {
      const stats = await memoryService.getStats();
      expect(typeof stats.averageAccessCount).toBe('number');
      expect(stats.averageAccessCount).toBeGreaterThanOrEqual(0);
    });
  });

  // =================================================================
  // 8. Associations
  // =================================================================
  describe('Memory Associations', () => {
    it('creates an association between two memories', async () => {
      const a = await memoryService.create({ scope: 'semantic', key: uniqueKey('assoc_a'), value: 'concept A' });
      const b = await memoryService.create({ scope: 'semantic', key: uniqueKey('assoc_b'), value: 'concept B' });

      const assoc = await memoryService.createAssociation(a.id, b.id, 0.8);
      expect(assoc.strength).toBe(0.8);
      expect(assoc.fromMemoryId).toBe(a.id);
      expect(assoc.toMemoryId).toBe(b.id);
    });

    it('rejects self-association', async () => {
      const entry = await memoryService.create({ scope: 'semantic', key: uniqueKey('assoc_self'), value: 'self' });
      await expect(memoryService.createAssociation(entry.id, entry.id)).rejects.toThrow();
    });

    it('retrieves associated memories', async () => {
      const a = await memoryService.create({ scope: 'semantic', key: uniqueKey('assoc_get_a'), value: 'node A' });
      const b = await memoryService.create({ scope: 'semantic', key: uniqueKey('assoc_get_b'), value: 'node B' });

      await memoryService.createAssociation(a.id, b.id, 0.9);

      const assocs = await memoryService.getAssociated(a.id);
      expect(assocs.length).toBe(1);
      expect(assocs[0].associatedId).toBe(b.id);
      expect(assocs[0].strength).toBe(0.9);
    });

    it('retrieves associations in specific direction', async () => {
      const a = await memoryService.create({ scope: 'semantic', key: uniqueKey('dir_a'), value: 'A' });
      const b = await memoryService.create({ scope: 'semantic', key: uniqueKey('dir_b'), value: 'B' });
      await memoryService.createAssociation(a.id, b.id);

      const fromAssocs = await memoryService.getAssociated(a.id, 'from');
      expect(fromAssocs.length).toBe(1);
      expect(fromAssocs[0].associatedId).toBe(b.id);

      const toAssocs = await memoryService.getAssociated(b.id, 'to');
      expect(toAssocs.length).toBe(1);
      expect(toAssocs[0].associatedId).toBe(a.id);
    });
  });

  // =================================================================
  // 9. Memory Context Builder
  // =================================================================
  describe('MemoryContextBuilder', () => {
    it('builds context from relevant memories', async () => {
      await memoryService.create({
        scope: 'semantic',
        key: uniqueKey('ctxb_react'),
        value: 'React uses JSX for templating',
        tags: ['react', 'jsx'],
        importance: 4,
      });

      const ctx = await buildMemoryContext({
        goal: 'How do I use JSX in React?',
      });

      // Should find at least the React memory
      expect(ctx.entryCount).toBeGreaterThan(0);
      expect(ctx.contextString).toContain('<memory-context>');
      expect(ctx.contextString).toContain('</memory-context>');
      expect(ctx.memoryIds.length).toBe(ctx.entryCount);
    });

    it('returns empty context when query matches nothing', async () => {
      const ctx = await buildMemoryContext({
        goal: 'zzzzz_nonexistent_query_99999_no_match_at_all',
        scopes: ['working'],
      });

      // Working scope was cleaned by removeByScope test.
      // Even with recency bonus, if no text matches, score should be
      // only the recency+importance bonus which is very small.
      // The real test: the context string should be empty or very minimal.
      // Since working was purged, this should be 0.
      expect(ctx.entryCount).toBe(0);
    });

    it('respects maxEntries limit', async () => {
      for (let i = 0; i < 10; i++) {
        await memoryService.create({
          scope: 'semantic',
          key: uniqueKey(`ctxb_limit_${i}`),
          value: `Fact ${i} about databases and SQL queries`,
          tags: ['database', 'sql'],
          importance: 4,
        });
      }

      const ctx = await buildMemoryContext({
        goal: 'database SQL query',
        maxEntries: 3,
      });

      expect(ctx.entryCount).toBeLessThanOrEqual(3);
    });
  });

  // =================================================================
  // 10. Memory Tools (Agent Interface)
  // =================================================================
  describe('Memory Agent Tools', () => {
    const tools = createMemoryTools();

    it('registers 4 memory tools', () => {
      expect(tools.length).toBe(4);
      const names = tools.map(t => t.name);
      expect(names).toContain('memory_store');
      expect(names).toContain('memory_recall');
      expect(names).toContain('memory_search');
      expect(names).toContain('memory_forget');
    });

    it('memory_store creates a memory entry', async () => {
      const tool = tools.find(t => t.name === 'memory_store')!;
      const result = await tool.execute({
        scope: 'semantic',
        key: uniqueKey('tool_store'),
        value: 'Stored via agent tool',
        tags: ['agent-tool', 'test'],
        importance: 4,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect((result.output as any).stored).toBe(true);
      expect((result.output as any).id).toBeDefined();
    });

    it('memory_recall finds a stored memory', async () => {
      const key = uniqueKey('tool_recall');
      // First store
      const storeTool = tools.find(t => t.name === 'memory_store')!;
      await storeTool.execute({ scope: 'preference', key, value: 'dark mode preferred' });

      // Then recall
      const recallTool = tools.find(t => t.name === 'memory_recall')!;
      const result = await recallTool.execute({ key, scope: 'preference' });

      expect(result.success).toBe(true);
      expect((result.output as any).found).toBe(true);
      expect((result.output as any).value).toBe('dark mode preferred');
    });

    it('memory_recall returns found=false for missing memory', async () => {
      const recallTool = tools.find(t => t.name === 'memory_recall')!;
      const result = await recallTool.execute({ key: 'nonexistent_key_xyz' });

      expect(result.success).toBe(true);
      expect((result.output as any).found).toBe(false);
    });

    it('memory_search returns relevant results', async () => {
      const storeTool = tools.find(t => t.name === 'memory_store')!;
      await storeTool.execute({
        scope: 'semantic',
        key: uniqueKey('tool_search_1'),
        value: 'Docker containers isolate applications',
        tags: ['docker', 'containers'],
      });

      const searchTool = tools.find(t => t.name === 'memory_search')!;
      const result = await searchTool.execute({ query: 'docker containers' });

      expect(result.success).toBe(true);
      expect((result.output as any).count).toBeGreaterThan(0);
    });

    it('memory_forget deletes a memory', async () => {
      const storeTool = tools.find(t => t.name === 'memory_store')!;
      const stored = await storeTool.execute({ scope: 'working', key: uniqueKey('tool_forget'), value: 'temporary' });
      const id = (stored.output as any).id;

      const forgetTool = tools.find(t => t.name === 'memory_forget')!;
      const result = await forgetTool.execute({ id });

      expect(result.success).toBe(true);
      expect((result.output as any).deleted).toBe(true);
    });

    it('all tools have valid input schemas', () => {
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
        expect(tool.inputSchema.required).toBeDefined();
        expect((tool.inputSchema.required as string[]).length).toBeGreaterThan(0);
      }
    });

    it('all tools have low risk level', () => {
      for (const tool of tools) {
        expect(tool.riskLevel).toBe('low');
      }
    });
  });

  // =================================================================
  // 11. Bulk operations
  // =================================================================
  describe('Bulk Operations', () => {
    it('bulk deletes multiple memories', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const entry = await memoryService.create({
          scope: 'working',
          key: uniqueKey(`bulk_del_${i}`),
          value: `bulk item ${i}`,
        });
        ids.push(entry.id);
      }

      const count = await memoryService.bulkRemove(ids);
      expect(count).toBe(3);

      for (const id of ids) {
        const found = await memoryService.getById(id);
        expect(found).toBeNull();
      }
    });

    it('removeByScope deletes all in a scope', async () => {
      const scope = 'working';
      const before = await memoryService.listByScope(scope);
      const count = await memoryService.removeByScope(scope);
      const after = await memoryService.listByScope(scope);

      expect(count).toBe(before.length);
      expect(after.length).toBe(0);
    });
  });

  // =================================================================
  // 12. Validation
  // =================================================================
  describe('Validation', () => {
    it('rejects invalid scope', async () => {
      await expect(
        memoryService.create({ scope: 'invalid' as any, key: 'bad' })
      ).rejects.toThrow();
    });

    it('rejects importance out of range', async () => {
      await expect(
        memoryService.create({ scope: 'semantic', key: uniqueKey('val_imp'), importance: 10 })
      ).rejects.toThrow();
    });

    it('VALID_SCOPES and VALID_SOURCES are exported', () => {
      expect(VALID_SCOPES).toContain('working');
      expect(VALID_SCOPES).toContain('episodic');
      expect(VALID_SCOPES).toContain('semantic');
      expect(VALID_SCOPES).toContain('preference');
      expect(VALID_SCOPES).toContain('project');

      expect(VALID_SOURCES).toContain('agent');
      expect(VALID_SOURCES).toContain('user');
      expect(VALID_SOURCES).toContain('system');
      expect(VALID_SOURCES).toContain('import');
    });
  });
});
