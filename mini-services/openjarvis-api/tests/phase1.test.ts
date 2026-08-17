/**
 * Phase 1 Acceptance Tests
 * 
 * Run: cd mini-services/openjarvis-api && bun test tests/phase1.test.ts
 * 
 * Tests:
 * 1. GET /health reflects real DB connectivity
 * 2. Mission CRUD through the service layer
 * 3. Every error response follows the structured format
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { db } from '../src/utils/db.js';
import { missionService } from '../src/services/missionService.js';
import { missionEventService } from '../src/services/missionEventService.js';
import { toolService } from '../src/services/toolService.js';
import { memoryService } from '../src/services/memoryService.js';
import { checkDbConnection } from '../src/utils/db.js';

// ---- Health Check Tests ----

describe('Phase 1 — Health Check', () => {
  it('GET /health reflects real DB connectivity', async () => {
    const result = await checkDbConnection();
    expect(result.alive).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });
});

// ---- Mission CRUD Tests ----

describe('Phase 1 — Mission CRUD', () => {
  let missionId: string;

  it('creates a mission with required fields', async () => {
    const mission = await missionService.create({ goal: 'Test goal' }, 'test-req-1');
    expect(mission.id).toBeDefined();
    expect(mission.goal).toBe('Test goal');
    expect(mission.status).toBe('draft');
    expect(mission.owner).toBe('default');
    expect(mission.budget).toBe(100000);
    expect(mission.maxToolCalls).toBe(50);
    expect(mission.toolCallCount).toBe(0);
    expect(mission.tokenUsage).toBe(0);
    missionId = mission.id;
  });

  it('reads a mission by ID', async () => {
    const mission = await missionService.getById(missionId, 'test-req-2');
    expect(mission.id).toBe(missionId);
    expect(mission.goal).toBe('Test goal');
    expect(mission.events).toBeDefined();
    expect(Array.isArray(mission.events)).toBe(true);
  });

  it('updates a mission status and plan', async () => {
    const updated = await missionService.update(missionId, {
      status: 'queued',
      plan: { steps: ['step1', 'step2'] },
    }, 'test-req-3');
    expect(updated.status).toBe('queued');
    expect(updated.plan).toBe(JSON.stringify({ steps: ['step1', 'step2'] }));
  });

  it('lists all missions', async () => {
    const missions = await missionService.list('test-req-4');
    expect(Array.isArray(missions)).toBe(true);
    expect(missions.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes a mission', async () => {
    await missionService.remove(missionId, 'test-req-5');
    // Should throw on subsequent get
    try {
      await missionService.getById(missionId, 'test-req-6');
      expect(true).toBe(false); // should not reach here
    } catch (err: any) {
      expect(err.code).toBe('MISSION_NOT_FOUND');
    }
  });
});

// ---- Mission Event Tests ----

describe('Phase 1 — Mission Events', () => {
  let missionId: string;

  beforeEach(async () => {
    const m = await missionService.create({ goal: 'Event test mission' }, 'test-req');
    missionId = m.id;
  });

  it('creates an event for a mission', async () => {
    const event = await missionEventService.create({
      missionId,
      type: 'interpret',
      payload: { raw: 'user input' },
    }, 'test-req');
    expect(event.id).toBeDefined();
    expect(event.type).toBe('interpret');
    expect(event.missionId).toBe(missionId);
  });

  it('lists events for a mission', async () => {
    await missionEventService.create({ missionId, type: 'plan' }, 'test-req');
    await missionEventService.create({ missionId, type: 'tool_execute' }, 'test-req');
    const events = await missionEventService.listByMission(missionId, 'test-req');
    expect(events.length).toBe(2);
    expect(events[0].type).toBe('plan');
    expect(events[1].type).toBe('tool_execute');
  });

  it('throws on event for nonexistent mission', async () => {
    try {
      await missionEventService.create({
        missionId: 'nonexistent',
        type: 'interpret',
      }, 'test-req');
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe('MISSION_NOT_FOUND');
    }
  });
});

// ---- Tool CRUD Tests ----

describe('Phase 1 — Tool CRUD', () => {
  it('creates a tool', async () => {
    const tool = await toolService.create({
      name: 'search',
      description: 'Search the web',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    }, 'test-req');
    expect(tool.name).toBe('search');
    expect(tool.enabled).toBe(true);
    expect(tool.riskLevel).toBe('low');
  });

  it('prevents duplicate tool names', async () => {
    try {
      await toolService.create({ name: 'search', description: 'dup' }, 'test-req');
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe('TOOL_EXISTS');
    }
  });

  it('gets a tool by name', async () => {
    const tool = await toolService.getByName('search', 'test-req');
    expect(tool.name).toBe('search');
  });

  it('lists all tools', async () => {
    const tools = await toolService.list();
    expect(tools.length).toBeGreaterThanOrEqual(1);
  });

  it('updates a tool', async () => {
    const updated = await toolService.update('search', { enabled: false }, 'test-req');
    expect(updated.enabled).toBe(false);
  });

  it('removes a tool', async () => {
    await toolService.remove('search', 'test-req');
    try {
      await toolService.getByName('search', 'test-req');
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe('TOOL_NOT_FOUND');
    }
  });
});

// ---- Memory CRUD Tests ----

describe('Phase 1 — Memory CRUD', () => {
  let memoryId: string;

  it('creates a memory entry', async () => {
    const entry = await memoryService.create({
      scope: 'working',
      key: 'current_task',
      value: { task: 'testing' },
    });
    expect(entry.id).toBeDefined();
    expect(entry.scope).toBe('working');
    expect(entry.key).toBe('current_task');
    memoryId = entry.id;
  });

  it('retrieves by scope and key', async () => {
    const entry = await memoryService.get('working', 'current_task');
    expect(entry).not.toBeNull();
    expect(entry!.key).toBe('current_task');
  });

  it('lists by scope', async () => {
    const entries = await memoryService.listByScope('working');
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('updates value', async () => {
    const updated = await memoryService.update(memoryId, { value: { task: 'updated' } });
    expect(updated.value).toBe(JSON.stringify({ task: 'updated' }));
  });

  it('deletes a memory entry', async () => {
    await memoryService.remove(memoryId);
    const entry = await memoryService.get('working', 'current_task');
    expect(entry).toBeNull();
  });
});

// ---- Error Format Tests ----

describe('Phase 1 — Structured Error Format', () => {
  it('notFound error has code, message, requestId', async () => {
    const { notFound } = await import('../src/utils/errors.js');
    const err = notFound('TEST_CODE', 'test message', 'req-123');
    const json = err.toJSON();
    expect(json).toEqual({
      error: {
        code: 'TEST_CODE',
        message: 'test message',
        requestId: 'req-123',
      },
    });
    expect(err.statusCode).toBe(404);
  });

  it('badRequest error has code, message, requestId', async () => {
    const { badRequest } = await import('../src/utils/errors.js');
    const err = badRequest('BAD', 'bad request', 'req-456');
    expect(err.statusCode).toBe(400);
    expect(err.toJSON().error.code).toBe('BAD');
  });

  it('internalError has statusCode 500', async () => {
    const { internalError } = await import('../src/utils/errors.js');
    const err = internalError('INT', 'internal', 'req-789');
    expect(err.statusCode).toBe(500);
  });
});
