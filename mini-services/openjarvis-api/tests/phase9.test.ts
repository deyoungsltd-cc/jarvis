/**
 * Phase 9 Tests — Opportunity Engine + Approval
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { db } from '../src/utils/db.js';
import { approvalService } from '../src/approval/approvalService.js';
import { opportunityService, analyzeForOpportunities } from '../src/approval/opportunityEngine.js';
import { ApprovalPolicyEngine, getApprovalPolicyEngine } from '../src/approval/approvalPolicy.js';
import {
  APPROVAL_STATUSES,
  VALID_APPROVAL_TRANSITIONS,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_STATUSES,
  VALID_OPPORTUNITY_TRANSITIONS,
  DEFAULT_APPROVAL_POLICY,
} from '../src/approval/types.js';

const TEST_REQ_ID = 'test-phase9';

// Helper: create a test mission
async function createTestMission(goal = 'test mission', overrides: Record<string, unknown> = {}) {
  return db.mission.create({
    data: { goal, status: 'running', ...overrides },
  });
}

describe('Phase 9 — Types', () => {
  it('APPROVAL_STATUSES has 5 statuses', () => {
    expect(APPROVAL_STATUSES).toHaveLength(5);
    expect(APPROVAL_STATUSES).toContain('pending');
    expect(APPROVAL_STATUSES).toContain('approved');
    expect(APPROVAL_STATUSES).toContain('rejected');
    expect(APPROVAL_STATUSES).toContain('expired');
    expect(APPROVAL_STATUSES).toContain('cancelled');
  });

  it('VALID_APPROVAL_TRANSITIONS: pending can go to 4 states', () => {
    expect(VALID_APPROVAL_TRANSITIONS.pending).toHaveLength(4);
    expect(VALID_APPROVAL_TRANSITIONS.pending).toContain('approved');
    expect(VALID_APPROVAL_TRANSITIONS.pending).toContain('rejected');
    expect(VALID_APPROVAL_TRANSITIONS.pending).toContain('expired');
    expect(VALID_APPROVAL_TRANSITIONS.pending).toContain('cancelled');
  });

  it('VALID_APPROVAL_TRANSITIONS: terminal states have no transitions', () => {
    expect(VALID_APPROVAL_TRANSITIONS.approved).toHaveLength(0);
    expect(VALID_APPROVAL_TRANSITIONS.rejected).toHaveLength(0);
    expect(VALID_APPROVAL_TRANSITIONS.expired).toHaveLength(0);
    expect(VALID_APPROVAL_TRANSITIONS.cancelled).toHaveLength(0);
  });

  it('OPPORTUNITY_TYPES has 5 types', () => {
    expect(OPPORTUNITY_TYPES).toHaveLength(5);
    expect(OPPORTUNITY_TYPES).toContain('efficiency');
    expect(OPPORTUNITY_TYPES).toContain('quality');
    expect(OPPORTUNITY_TYPES).toContain('safety');
    expect(OPPORTUNITY_TYPES).toContain('discovery');
    expect(OPPORTUNITY_TYPES).toContain('optimization');
  });

  it('OPPORTUNITY_STATUSES has 5 statuses', () => {
    expect(OPPORTUNITY_STATUSES).toHaveLength(5);
  });

  it('VALID_OPPORTUNITY_TRANSITIONS: suggested can go to 4 states', () => {
    expect(VALID_OPPORTUNITY_TRANSITIONS.suggested).toHaveLength(4);
    expect(VALID_OPPORTUNITY_TRANSITIONS.suggested).toContain('acknowledged');
    expect(VALID_OPPORTUNITY_TRANSITIONS.suggested).toContain('dismissed');
    expect(VALID_OPPORTUNITY_TRANSITIONS.suggested).toContain('acted_upon');
    expect(VALID_OPPORTUNITY_TRANSITIONS.suggested).toContain('expired');
  });

  it('DEFAULT_APPROVAL_POLICY has expected defaults', () => {
    expect(DEFAULT_APPROVAL_POLICY.autoApproveRiskLevels).toEqual(['low']);
    expect(DEFAULT_APPROVAL_POLICY.hardBlockRiskLevels).toEqual(['critical']);
    expect(DEFAULT_APPROVAL_POLICY.requireApprovalRiskLevels).toEqual(['medium', 'high']);
    expect(DEFAULT_APPROVAL_POLICY.defaultTtlSeconds).toBe(300);
    expect(DEFAULT_APPROVAL_POLICY.trustRepeatedToolUse).toBe(true);
    expect(DEFAULT_APPROVAL_POLICY.trustRepeatLimit).toBe(5);
    expect(DEFAULT_APPROVAL_POLICY.opportunityEngineEnabled).toBe(true);
  });
});

describe('Phase 9 — Approval Service CRUD', () => {
  let missionId: string;

  beforeEach(async () => {
    const mission = await createTestMission('approval test');
    missionId = mission.id;
  });

  it('creates an approval request', async () => {
    const req = await approvalService.create({
      missionId,
      toolName: 'shell_execute',
      toolInput: { command: 'ls' },
      riskLevel: 'critical',
      reason: 'Critical tool needs approval',
    }, TEST_REQ_ID);

    expect(req.id).toBeDefined();
    expect(req.missionId).toBe(missionId);
    expect(req.toolName).toBe('shell_execute');
    expect(req.riskLevel).toBe('critical');
    expect(req.status).toBe('pending');
    expect(req.reason).toBe('Critical tool needs approval');
    expect(req.expiresAt).toBeDefined();
  });

  it('gets an approval request by ID', async () => {
    const created = await approvalService.create({
      missionId,
      toolName: 'test_tool',
      riskLevel: 'medium',
    }, TEST_REQ_ID);

    const fetched = await approvalService.getById(created.id, TEST_REQ_ID);
    expect(fetched.id).toBe(created.id);
    expect(fetched.toolName).toBe('test_tool');
  });

  it('throws on get with invalid ID', async () => {
    await expect(approvalService.getById('nonexistent-id', TEST_REQ_ID)).rejects.toThrow();
  });

  it('lists approval requests', async () => {
    await approvalService.create({ missionId, toolName: 'tool_a', riskLevel: 'low' }, TEST_REQ_ID);
    await approvalService.create({ missionId, toolName: 'tool_b', riskLevel: 'medium' }, TEST_REQ_ID);

    const list = await approvalService.list({}, TEST_REQ_ID);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('lists approval requests filtered by mission', async () => {
    const otherMission = await createTestMission('other mission');
    await approvalService.create({ missionId, toolName: 'tool_a', riskLevel: 'low' }, TEST_REQ_ID);
    await approvalService.create({ missionId: otherMission.id, toolName: 'tool_b', riskLevel: 'low' }, TEST_REQ_ID);

    const filtered = await approvalService.list({ missionId }, TEST_REQ_ID);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].toolName).toBe('tool_a');
  });

  it('lists approval requests filtered by status', async () => {
    const req = await approvalService.create({ missionId, toolName: 'tool_a', riskLevel: 'low' }, TEST_REQ_ID);
    await approvalService.approve(req.id, {}, TEST_REQ_ID);

    const pending = await approvalService.list({ status: 'pending' }, TEST_REQ_ID);
    const approved = await approvalService.list({ status: 'approved' }, TEST_REQ_ID);
    expect(pending.every(r => r.status === 'pending')).toBe(true);
    expect(approved.some(r => r.id === req.id)).toBe(true);
  });

  it('listPending returns only pending requests', async () => {
    const req = await approvalService.create({ missionId, toolName: 'tool_a', riskLevel: 'low' }, TEST_REQ_ID);
    await approvalService.approve(req.id, {}, TEST_REQ_ID);
    await approvalService.create({ missionId, toolName: 'tool_b', riskLevel: 'low' }, TEST_REQ_ID);

    const pending = await approvalService.listPending(TEST_REQ_ID);
    expect(pending.every(r => r.status === 'pending')).toBe(true);
  });
});

describe('Phase 9 — Approval Lifecycle', () => {
  let missionId: string;
  let approvalId: string;

  beforeEach(async () => {
    const mission = await createTestMission('lifecycle test');
    missionId = mission.id;
    const req = await approvalService.create({
      missionId,
      toolName: 'test_tool',
      riskLevel: 'medium',
    }, TEST_REQ_ID);
    approvalId = req.id;
  });

  it('approves a pending request', async () => {
    const approved = await approvalService.approve(approvalId, { resolvedBy: 'admin' }, TEST_REQ_ID);
    expect(approved.status).toBe('approved');
    expect(approved.resolvedBy).toBe('admin');
    expect(approved.resolvedAt).toBeDefined();
  });

  it('rejects a pending request', async () => {
    const rejected = await approvalService.reject(approvalId, { resolvedBy: 'admin' }, TEST_REQ_ID);
    expect(rejected.status).toBe('rejected');
    expect(rejected.resolvedBy).toBe('admin');
  });

  it('cancels a pending request', async () => {
    const cancelled = await approvalService.cancel(approvalId, TEST_REQ_ID);
    expect(cancelled.status).toBe('cancelled');
  });

  it('throws on double approve', async () => {
    await approvalService.approve(approvalId, {}, TEST_REQ_ID);
    await expect(approvalService.approve(approvalId, {}, TEST_REQ_ID)).rejects.toThrow();
  });

  it('throws on rejecting an approved request', async () => {
    await approvalService.approve(approvalId, {}, TEST_REQ_ID);
    await expect(approvalService.reject(approvalId, {}, TEST_REQ_ID)).rejects.toThrow();
  });

  it('cancelAllForMission cancels all pending', async () => {
    await approvalService.create({ missionId, toolName: 'cancel_a', riskLevel: 'low' }, TEST_REQ_ID);
    await approvalService.create({ missionId, toolName: 'cancel_b', riskLevel: 'medium' }, TEST_REQ_ID);
    const req3 = await approvalService.create({ missionId, toolName: 'cancel_c', riskLevel: 'high' }, TEST_REQ_ID);

    // Approve one before cancel all
    await approvalService.approve(req3.id, {}, TEST_REQ_ID);

    const count = await approvalService.cancelAllForMission(missionId, TEST_REQ_ID);
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(3); // May include stragglers from other tests

    const pending = await approvalService.list({ missionId, status: 'pending' }, TEST_REQ_ID);
    expect(pending).toHaveLength(0);
  });

  it('countRecentApprovals counts approved for a tool', async () => {
    // Create and approve 3 requests for the same tool
    for (let i = 0; i < 3; i++) {
      const req = await approvalService.create({ missionId, toolName: 'repeated_tool', riskLevel: 'medium' }, TEST_REQ_ID);
      await approvalService.approve(req.id, {}, TEST_REQ_ID);
    }

    const count = await approvalService.countRecentApprovals(missionId, 'repeated_tool', 10);
    expect(count).toBe(3);
  });

  it('countRecentApprovals returns 0 for different tool', async () => {
    const count = await approvalService.countRecentApprovals(missionId, 'nonexistent_tool', 10);
    expect(count).toBe(0);
  });

  it('expires a pending request', async () => {
    const expired = await approvalService.expire(approvalId, TEST_REQ_ID);
    expect(expired.status).toBe('expired');
    expect(expired.resolvedBy).toBe('system');
  });

  it('expire is no-op on non-pending', async () => {
    await approvalService.approve(approvalId, {}, TEST_REQ_ID);
    const result = await approvalService.expire(approvalId, TEST_REQ_ID);
    expect(result.status).toBe('approved');
  });
});

describe('Phase 9 — Opportunity Service', () => {
  let missionId: string;

  beforeEach(async () => {
    const mission = await createTestMission('opportunity test');
    missionId = mission.id;
  });

  it('creates an opportunity', async () => {
    const opp = await opportunityService.create({
      missionId,
      type: 'efficiency',
      title: 'Budget running low',
      description: '70% of budget consumed',
      confidence: 0.9,
      impact: 'high',
      actions: [
        { label: 'Increase budget', type: 'adjust_budget', params: { budget: 200000 } },
      ],
    }, TEST_REQ_ID);

    expect(opp.id).toBeDefined();
    expect(opp.type).toBe('efficiency');
    expect(opp.title).toBe('Budget running low');
    expect(opp.status).toBe('suggested');
    expect(opp.confidence).toBe(0.9);
    expect(opp.impact).toBe('high');
    expect(opp.actions).toBeDefined();
  });

  it('creates opportunity without missionId', async () => {
    const opp = await opportunityService.create({
      type: 'discovery',
      title: 'New tool available',
      description: 'A new MCP server was connected',
    }, TEST_REQ_ID);
    expect(opp.missionId).toBeNull();
    expect(opp.type).toBe('discovery');
  });

  it('gets an opportunity by ID', async () => {
    const created = await opportunityService.create({
      missionId,
      type: 'safety',
      title: 'Test',
      description: 'Test opp',
    }, TEST_REQ_ID);

    const fetched = await opportunityService.getById(created.id, TEST_REQ_ID);
    expect(fetched.id).toBe(created.id);
    expect(fetched.title).toBe('Test');
  });

  it('throws on get with invalid ID', async () => {
    await expect(opportunityService.getById('nonexistent', TEST_REQ_ID)).rejects.toThrow();
  });

  it('lists opportunities with filters', async () => {
    await opportunityService.create({ missionId, type: 'efficiency', title: 'Opp 1', description: 'd1' }, TEST_REQ_ID);
    await opportunityService.create({ missionId, type: 'safety', title: 'Opp 2', description: 'd2' }, TEST_REQ_ID);

    const byType = await opportunityService.list({ type: 'efficiency' }, TEST_REQ_ID);
    expect(byType.every(o => o.type === 'efficiency')).toBe(true);

    const byMission = await opportunityService.list({ missionId }, TEST_REQ_ID);
    expect(byMission).toHaveLength(2);

    const byStatus = await opportunityService.list({ status: 'suggested' }, TEST_REQ_ID);
    expect(byStatus.every(o => o.status === 'suggested')).toBe(true);
  });

  it('acknowledges an opportunity', async () => {
    const opp = await opportunityService.create({
      missionId, type: 'quality', title: 'Test', description: 'd',
    }, TEST_REQ_ID);
    const updated = await opportunityService.acknowledge(opp.id, TEST_REQ_ID);
    expect(updated.status).toBe('acknowledged');
  });

  it('dismisses an opportunity', async () => {
    const opp = await opportunityService.create({
      missionId, type: 'optimization', title: 'Test', description: 'd',
    }, TEST_REQ_ID);
    const updated = await opportunityService.dismiss(opp.id, TEST_REQ_ID);
    expect(updated.status).toBe('dismissed');
  });

  it('marks opportunity as acted upon', async () => {
    const opp = await opportunityService.create({
      missionId, type: 'efficiency', title: 'Test', description: 'd',
    }, TEST_REQ_ID);
    await opportunityService.acknowledge(opp.id, TEST_REQ_ID);
    const updated = await opportunityService.markActedUpon(opp.id, TEST_REQ_ID);
    expect(updated.status).toBe('acted_upon');
  });

  it('throws on invalid opportunity transitions', async () => {
    const opp = await opportunityService.create({
      missionId, type: 'efficiency', title: 'Test', description: 'd',
    }, TEST_REQ_ID);
    await opportunityService.dismiss(opp.id, TEST_REQ_ID);
    await expect(opportunityService.acknowledge(opp.id, TEST_REQ_ID)).rejects.toThrow();
  });
});

describe('Phase 9 — Opportunity Analysis', () => {
  let missionId: string;

  beforeEach(async () => {
    const mission = await createTestMission('analysis test', {
      budget: 100000,
      maxToolCalls: 50,
    });
    missionId = mission.id;
  });

  it('detects budget running low (efficiency opportunity)', async () => {
    await analyzeForOpportunities({
      missionId,
      iterationsCompleted: 6,
      maxIterations: 10,
      tokensUsed: 75000,
      tokenBudget: 100000,
      toolCallCount: 5,
      maxToolCalls: 50,
      requestId: TEST_REQ_ID,
    });

    const opps = await opportunityService.list({ missionId, type: 'efficiency' }, TEST_REQ_ID);
    expect(opps.length).toBeGreaterThanOrEqual(1);
    const budgetOpp = opps.find(o => o.title === 'Token budget running low');
    expect(budgetOpp).toBeDefined();
    expect(budgetOpp!.confidence).toBe(0.9);
    expect(budgetOpp!.impact).toBe('high');
  });

  it('detects approaching iteration limit (optimization opportunity)', async () => {
    await analyzeForOpportunities({
      missionId,
      iterationsCompleted: 8,
      maxIterations: 10,
      tokensUsed: 50000,
      tokenBudget: 100000,
      toolCallCount: 5,
      maxToolCalls: 50,
      requestId: TEST_REQ_ID,
    });

    const opps = await opportunityService.list({ missionId, type: 'optimization' }, TEST_REQ_ID);
    expect(opps.length).toBeGreaterThanOrEqual(1);
  });

  it('detects high tool usage (discovery opportunity)', async () => {
    await analyzeForOpportunities({
      missionId,
      iterationsCompleted: 4,
      maxIterations: 10,
      tokensUsed: 30000,
      tokenBudget: 100000,
      toolCallCount: 30,
      maxToolCalls: 50,
      requestId: TEST_REQ_ID,
    });

    const opps = await opportunityService.list({ missionId, type: 'discovery' }, TEST_REQ_ID);
    expect(opps.length).toBeGreaterThanOrEqual(1);
  });

  it('does not create opportunities when everything is healthy', async () => {
    await analyzeForOpportunities({
      missionId,
      iterationsCompleted: 2,
      maxIterations: 50,
      tokensUsed: 10000,
      tokenBudget: 100000,
      toolCallCount: 3,
      maxToolCalls: 50,
      requestId: TEST_REQ_ID,
    });

    const opps = await opportunityService.list({ missionId }, TEST_REQ_ID);
    expect(opps).toHaveLength(0);
  });

  it('creates multiple opportunities at once', async () => {
    await analyzeForOpportunities({
      missionId,
      iterationsCompleted: 8,
      maxIterations: 10,
      tokensUsed: 80000,
      tokenBudget: 100000,
      toolCallCount: 30,
      maxToolCalls: 50,
      requestId: TEST_REQ_ID,
    });

    const opps = await opportunityService.list({ missionId }, TEST_REQ_ID);
    expect(opps.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Phase 9 — Approval Policy Engine', () => {
  let missionId: string;

  beforeEach(async () => {
    const mission = await createTestMission('policy test');
    missionId = mission.id;
  });

  it('auto-approves low-risk tools', async () => {
    const engine = new ApprovalPolicyEngine();
    const result = await engine.checkToolExecution({
      missionId,
      toolName: 'web_search',
      toolInput: { query: 'test' },
      riskLevel: 'low',
      requestId: TEST_REQ_ID,
    });

    expect(result.allowed).toBe(true);
  });

  it('creates approval request for medium-risk tools', async () => {
    const engine = new ApprovalPolicyEngine();
    const result = await engine.checkToolExecution({
      missionId,
      toolName: 'filesystem_write',
      toolInput: { path: '/tmp/test', content: 'hello' },
      riskLevel: 'medium',
      requestId: TEST_REQ_ID,
    }) as { allowed: false; reason: string; approvalRequestId: string };

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('requires_approval');
    expect(result.approvalRequestId).toBeDefined();
  });

  it('creates approval request for high-risk tools', async () => {
    const engine = new ApprovalPolicyEngine();
    const result = await engine.checkToolExecution({
      missionId,
      toolName: 'app_close',
      toolInput: { appName: 'test' },
      riskLevel: 'high',
      requestId: TEST_REQ_ID,
    }) as { allowed: false; reason: string; approvalRequestId: string };

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('requires_approval');
  });

  it('creates approval request for critical-risk tools (hard-blocked)', async () => {
    const engine = new ApprovalPolicyEngine();
    const result = await engine.checkToolExecution({
      missionId,
      toolName: 'shell_execute',
      toolInput: { command: 'rm -rf /' },
      riskLevel: 'critical',
      requestId: TEST_REQ_ID,
    }) as { allowed: false; reason: string; approvalRequestId: string };

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('requires_approval');
    expect(result.approvalRequestId).toBeDefined();
  });

  it('trust-based auto-approve after repeated approvals', async () => {
    // First, create and approve 5 requests for the same tool
    for (let i = 0; i < 5; i++) {
      const req = await approvalService.create({
        missionId,
        toolName: 'trusted_tool',
        riskLevel: 'medium',
      }, TEST_REQ_ID);
      await approvalService.approve(req.id, { resolvedBy: 'user' }, TEST_REQ_ID);
    }

    const engine = new ApprovalPolicyEngine();
    const result = await engine.checkToolExecution({
      missionId,
      toolName: 'trusted_tool',
      toolInput: {},
      riskLevel: 'medium',
      requestId: TEST_REQ_ID,
    });

    // Should be auto-approved because trust limit reached
    expect(result.allowed).toBe(true);
  });

  it('custom policy overrides defaults', () => {
    const engine = new ApprovalPolicyEngine({
      autoApproveRiskLevels: ['low', 'medium'],
      hardBlockRiskLevels: [],
      requireApprovalRiskLevels: ['high'],
      trustRepeatedToolUse: false,
    });

    const policy = engine.getPolicy();
    expect(policy.autoApproveRiskLevels).toEqual(['low', 'medium']);
    expect(policy.hardBlockRiskLevels).toEqual([]);
    expect(policy.trustRepeatedToolUse).toBe(false);
  });

  it('updatePolicy merges changes', () => {
    const engine = new ApprovalPolicyEngine();
    engine.updatePolicy({ defaultTtlSeconds: 600 });
    const policy = engine.getPolicy();
    expect(policy.defaultTtlSeconds).toBe(600);
    // Other defaults preserved
    expect(policy.autoApproveRiskLevels).toEqual(['low']);
  });

  it('getApprovalPolicyEngine returns singleton', () => {
    const a = getApprovalPolicyEngine();
    const b = getApprovalPolicyEngine();
    expect(a).toBe(b);
  });
});

describe('Phase 9 — End-to-End: Approval → Resume Flow', () => {
  it('full flow: create approval, approve, verify resolved', async () => {
    const mission = await createTestMission('e2e flow');

    // 1. Policy engine creates an approval request
    const engine = new ApprovalPolicyEngine();
    const checkResult = await engine.checkToolExecution({
      missionId: mission.id,
      toolName: 'risky_tool',
      toolInput: { action: 'delete' },
      riskLevel: 'high',
      requestId: TEST_REQ_ID,
    }) as { allowed: false; reason: string; approvalRequestId: string };

    expect(checkResult.allowed).toBe(false);
    expect(checkResult.approvalRequestId).toBeDefined();

    // 2. Fetch the pending approval
    const pending = await approvalService.getById(checkResult.approvalRequestId, TEST_REQ_ID);
    expect(pending.status).toBe('pending');
    expect(pending.toolName).toBe('risky_tool');

    // 3. Approve it
    const approved = await approvalService.approve(checkResult.approvalRequestId, {
      resolvedBy: 'admin',
    }, TEST_REQ_ID);
    expect(approved.status).toBe('approved');
    expect(approved.resolvedBy).toBe('admin');
    expect(approved.resolvedAt).toBeDefined();

    // 4. Verify it's no longer in pending list
    const pendingList = await approvalService.listPending(TEST_REQ_ID);
    expect(pendingList.find(r => r.id === checkResult.approvalRequestId)).toBeUndefined();
  });

  it('full flow: create opportunity, acknowledge, act upon', async () => {
    const mission = await createTestMission('opp flow');

    // 1. Create opportunity
    const opp = await opportunityService.create({
      missionId: mission.id,
      type: 'efficiency',
      title: 'Increase budget',
      description: 'Running low on tokens',
      confidence: 0.8,
      impact: 'medium',
    }, TEST_REQ_ID);
    expect(opp.status).toBe('suggested');

    // 2. Acknowledge
    const acked = await opportunityService.acknowledge(opp.id, TEST_REQ_ID);
    expect(acked.status).toBe('acknowledged');

    // 3. Act upon
    const acted = await opportunityService.markActedUpon(opp.id, TEST_REQ_ID);
    expect(acted.status).toBe('acted_upon');

    // 4. Verify terminal
    await expect(opportunityService.acknowledge(opp.id, TEST_REQ_ID)).rejects.toThrow();
  });
});
