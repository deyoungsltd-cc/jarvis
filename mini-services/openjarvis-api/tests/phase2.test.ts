import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MissionStateMachine } from '../src/agent/missionStateMachine.js';
import { ToolRegistry } from '../src/agent/toolRegistry.js';
import { ToolHandler, ToolExecutionResult } from '../src/agent/types.js';
import { db } from '../src/utils/db.js';
import { missionService } from '../src/services/missionService.js';
import { missionEventService } from '../src/services/missionEventService.js';
import { memoryService } from '../src/services/memoryService.js';

// ---- Mission State Machine Tests ----

describe('Phase 2 — Mission State Machine', () => {
  it('allows valid transition: draft → queued', () => {
    const result = MissionStateMachine.transition('draft', 'queued');
    expect(result).toBe('queued');
  });

  it('allows valid transition: queued → running', () => {
    const result = MissionStateMachine.transition('queued', 'running');
    expect(result).toBe('running');
  });

  it('allows valid transition: running → completed', () => {
    const result = MissionStateMachine.transition('running', 'completed');
    expect(result).toBe('completed');
  });

  it('allows valid transition: running → blocked', () => {
    const result = MissionStateMachine.transition('running', 'blocked');
    expect(result).toBe('blocked');
  });

  it('allows valid transition: blocked → queued (retry)', () => {
    const result = MissionStateMachine.transition('blocked', 'queued');
    expect(result).toBe('queued');
  });

  it('rejects invalid transition: completed → running', () => {
    expect(() => MissionStateMachine.transition('completed', 'running'))
      .toThrow("Invalid transition: 'completed' → 'running'");
  });

  it('rejects invalid transition: draft → completed (skip states)', () => {
    expect(() => MissionStateMachine.transition('draft', 'completed'))
      .toThrow();
  });

  it('rejects transition from terminal state: cancelled → running', () => {
    expect(() => MissionStateMachine.transition('cancelled', 'running'))
      .toThrow();
  });

  it('canTransition returns true for valid, false for invalid', () => {
    expect(MissionStateMachine.canTransition('draft', 'queued')).toBe(true);
    expect(MissionStateMachine.canTransition('draft', 'running')).toBe(false);
    expect(MissionStateMachine.canTransition('completed', 'running')).toBe(false);
  });

  it('getAllowedTransitions returns correct states', () => {
    const draftTransitions = MissionStateMachine.getAllowedTransitions('draft');
    expect(draftTransitions).toContain('queued');
    expect(draftTransitions).toContain('cancelled');
    expect(draftTransitions).not.toContain('running');

    const completedTransitions = MissionStateMachine.getAllowedTransitions('completed');
    expect(completedTransitions).toEqual([]);
  });
});

// ---- Tool Registry Tests ----

describe('Phase 2 — Tool Registry', () => {
  it('registers and retrieves a tool', () => {
    const registry = new ToolRegistry();
    const tool: ToolHandler = {
      name: 'test_tool',
      description: 'A test',
      inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
      outputSchema: { type: 'object', properties: { y: { type: 'string' } } },
      riskLevel: 'low',
      execute: async (input) => ({ success: true, output: { y: input.x }, durationMs: 1 }),
    };
    registry.register(tool);
    expect(registry.get('test_tool')).toBeDefined();
    expect(registry.getAll()).toHaveLength(1);
  });

  it('rejects duplicate tool names', () => {
    const registry = new ToolRegistry();
    const tool: ToolHandler = {
      name: 'dup', description: 'dup', inputSchema: {}, outputSchema: {},
      riskLevel: 'low', execute: async () => ({ success: true, output: null, durationMs: 0 }),
    };
    registry.register(tool);
    expect(() => registry.register(tool)).toThrow("Tool 'dup' is already registered");
  });

  it('executes a tool successfully', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'echo',
      description: 'Echoes input',
      inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] },
      outputSchema: { type: 'object', properties: { echoed: { type: 'string' } } },
      riskLevel: 'low',
      execute: async (input) => ({ success: true, output: { echoed: input.msg }, durationMs: 1 }),
    });
    const result = await registry.executeTool('echo', { msg: 'hello' }, { requestId: 'test' });
    expect(result.success).toBe(true);
    expect((result.output as any).echoed).toBe('hello');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('validates required input fields', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'strict',
      description: 'Strict tool',
      inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
      outputSchema: {},
      riskLevel: 'low',
      execute: async () => ({ success: true, output: null, durationMs: 0 }),
    });
    const result = await registry.executeTool('strict', {}, { requestId: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required field: x');
  });

  it('handles tool not found', async () => {
    const registry = new ToolRegistry();
    const result = await registry.executeTool('nonexistent', {}, { requestId: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found in registry");
  });

  it('retries on transient failure and succeeds', async () => {
    let attempts = 0;
    const registry = new ToolRegistry();
    registry.register({
      name: 'flaky',
      description: 'Flaky tool',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {},
      riskLevel: 'low',
      execute: async () => {
        attempts++;
        if (attempts < 3) throw new Error('transient failure');
        return { success: true, output: { ok: true }, durationMs: 1 };
      },
    });
    const result = await registry.executeTool('flaky', {}, {
      retryCount: 3,
      retryBackoffMs: 10,
      requestId: 'test',
    });
    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
  });

  it('retries on transient failure and exhausts retries', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'always_fail',
      description: 'Always fails',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {},
      riskLevel: 'low',
      execute: async () => { throw new Error('permanent failure'); },
    });
    const result = await registry.executeTool('always_fail', {}, {
      retryCount: 2,
      retryBackoffMs: 10,
      requestId: 'test',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('All 3 attempts failed');
  });

  it('times out a slow tool', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'slow',
      description: 'Slow tool',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {},
      riskLevel: 'low',
      execute: async () => {
        await new Promise(r => setTimeout(r, 5000));
        return { success: true, output: null, durationMs: 0 };
      },
    });
    const result = await registry.executeTool('slow', {}, {
      timeoutMs: 50,
      retryCount: 0,
      requestId: 'test',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('produces audit log entries for every execution', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'audited',
      description: 'Audited',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {},
      riskLevel: 'low',
      execute: async () => ({ success: true, output: { v: 1 }, durationMs: 1 }),
    });
    expect(registry.getAuditLog()).toHaveLength(0);
    await registry.executeTool('audited', {}, { requestId: 'test' });
    expect(registry.getAuditLog()).toHaveLength(1);
    expect(registry.getAuditLog()[0].toolName).toBe('audited');
  });

  it('getToolDefinitions returns correct shape for model provider', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'my_tool',
      description: 'My tool',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
      outputSchema: {},
      riskLevel: 'low',
      execute: async () => ({ success: true, output: null, durationMs: 0 }),
    });
    const defs = registry.getToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('my_tool');
    expect(defs[0].description).toBe('My tool');
    expect(defs[0].inputSchema).toEqual({ type: 'object', properties: { q: { type: 'string' } } });
  });
});

// ---- Budget Guard Tests (unit-level, no model needed) ----

describe('Phase 2 — Budget/Iteration Cap Guard', () => {
  it('mission tracks token and tool call counters', async () => {
    const mission = await missionService.create({
      goal: 'Budget test',
      budget: 500,
      maxToolCalls: 3,
    }, 'test-req');

    const updated = await missionService.update(mission.id, {
      tokenUsage: 450,
      toolCallCount: 2,
    }, 'test-req');

    expect(updated.tokenUsage).toBe(450);
    expect(updated.toolCallCount).toBe(2);
    expect(updated.budget).toBe(500);
    expect(updated.maxToolCalls).toBe(3);

    await missionService.remove(mission.id, 'test-req');
  });
});

// ---- End-to-End: Full Event Trail Test ----

describe('Phase 2 — Full Event Trail (model-free path)', () => {
  it('mission event trail records all stages', async () => {
    const mission = await missionService.create({
      goal: 'Event trail test',
      budget: 100000,
      maxToolCalls: 50,
    }, 'test-req');

    // Simulate the stages the agent loop would record
    const stages = ['interpret', 'plan', 'tool_select', 'tool_execute', 'observe', 'verify', 'memory_update', 'complete'];
    for (const stage of stages) {
      await missionEventService.create({
        missionId: mission.id,
        type: stage,
        payload: { simulated: true, stage },
      }, 'test-req');
    }

    // Verify the full trail
    const events = await missionEventService.listByMission(mission.id, 'test-req');
    expect(events.length).toBe(stages.length);
    expect(events[0].type).toBe('interpret');
    expect(events[events.length - 1].type).toBe('complete');

    // Verify through the mission endpoint (includes events)
    const fullMission = await missionService.getById(mission.id, 'test-req');
    expect(fullMission.events.length).toBe(stages.length);

    await missionService.remove(mission.id, 'test-req');
  });
});

// ---- Memory Integration Test ----

describe('Phase 2 — Memory Integration', () => {
  it('stores and retrieves agent working memory', async () => {
    await memoryService.create({
      scope: 'working',
      key: 'current_plan',
      value: { step: 1, description: 'search for info' },
    });

    const entry = await memoryService.get('working', 'current_plan');
    expect(entry).not.toBeNull();
    const value = JSON.parse(entry!.value!);
    expect(value.step).toBe(1);
  });
});
