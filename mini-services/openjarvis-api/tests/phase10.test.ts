/*
 * Phase 10 Tests — Approval Workflow & Human-in-the-Loop
 *
 * Tests the approval system directly (no HTTP server needed):
 * 1. Approval Request CRUD: create, get, list, approve, reject, cancel
 * 2. Approval Request Lifecycle: expiry, status guards, double-action prevention
 * 3. Approval Rules Engine: auto-approve, auto-reject, require_manual, priority
 * 4. Approval Gate: permission-gated tools, risk-level gating, rule overrides
 * 5. Stats & Edge Cases
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { approvalService } from '../src/services/approvalService.js';
import { checkApprovalGate } from '../src/services/approvalGate.js';
import { db } from '../src/utils/db.js';

const TEST_MISSION_ID = 'test-mission-phase10';

// =================================================================
// 1. Approval Request CRUD
// =================================================================

describe('Phase 10 — Approval Request CRUD', () => {
  beforeEach(async () => {
    await db.approvalRequest.deleteMany();
    await db.approvalRule.deleteMany();
  });

  it('creates an approval request', async () => {
    const req = await approvalService.create({
      missionId: TEST_MISSION_ID,
      toolName: 'shell_execute',
      capability: 'shell_execute',
      riskLevel: 'critical',
      reason: 'Wants to run a shell command',
      toolInput: { command: 'ls' },
    });

    expect(req.id).toBeDefined();
    expect(req.missionId).toBe(TEST_MISSION_ID);
    expect(req.toolName).toBe('shell_execute');
    expect(req.capability).toBe('shell_execute');
    expect(req.riskLevel).toBe('critical');
    expect(req.status).toBe('pending');
    expect(req.reason).toBe('Wants to run a shell command');
    expect(req.toolInput).toEqual({ command: 'ls' });
    expect(req.expiresAt).toBeDefined();
    expect(req.createdAt).toBeDefined();
  });

  it('gets an approval request by ID', async () => {
    const created = await approvalService.create({
      missionId: TEST_MISSION_ID,
      toolName: 'filesystem_delete',
      riskLevel: 'critical',
    });

    const fetched = await approvalService.getById(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.toolName).toBe('filesystem_delete');
  });

  it('throws when getting non-existent approval request', async () => {
    await expect(approvalService.getById('non-existent-id')).rejects.toThrow('not found');
  });

  it('lists approval requests', async () => {
    await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 'tool_a', riskLevel: 'high' });
    await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 'tool_b', riskLevel: 'medium' });

    const result = await approvalService.list();
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it('lists with status filter', async () => {
    const r1 = await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 't1', riskLevel: 'high' });
    await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 't2', riskLevel: 'high' });
    await approvalService.approve(r1.id);

    const pending = await approvalService.list({ status: 'pending' });
    expect(pending.total).toBe(1);

    const approved = await approvalService.list({ status: 'approved' });
    expect(approved.total).toBe(1);
  });

  it('lists with missionId filter', async () => {
    await approvalService.create({ missionId: 'mission-1', toolName: 't1', riskLevel: 'high' });
    await approvalService.create({ missionId: 'mission-2', toolName: 't2', riskLevel: 'high' });

    const result = await approvalService.list({ missionId: 'mission-1' });
    expect(result.total).toBe(1);
    expect(result.items[0].missionId).toBe('mission-1');
  });

  it('lists with riskLevel filter', async () => {
    await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 't1', riskLevel: 'low' });
    await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 't2', riskLevel: 'critical' });

    const result = await approvalService.list({ riskLevel: 'critical' });
    expect(result.total).toBe(1);
  });

  it('supports pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await approvalService.create({ missionId: TEST_MISSION_ID, toolName: `tool_${i}`, riskLevel: 'medium' });
    }

    const page1 = await approvalService.list({ limit: 2, offset: 0 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = await approvalService.list({ limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(2);
  });
});

// =================================================================
// 2. Approval Request Lifecycle
// =================================================================

describe('Phase 10 — Approval Lifecycle', () => {
  beforeEach(async () => {
    await db.approvalRequest.deleteMany();
    await db.approvalRule.deleteMany();
  });

  it('approves a pending request', async () => {
    const req = await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 'shell_execute', riskLevel: 'critical' });
    const approved = await approvalService.approve(req.id, 'admin', 'Looks safe');

    expect(approved.status).toBe('approved');
    expect(approved.resolvedBy).toBe('admin');
    expect(approved.response).toBe('Looks safe');
    expect(approved.resolvedAt).toBeDefined();
  });

  it('rejects a pending request', async () => {
    const req = await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 'filesystem_delete', riskLevel: 'critical' });
    const rejected = await approvalService.reject(req.id, 'admin', 'Too dangerous');

    expect(rejected.status).toBe('rejected');
    expect(rejected.resolvedBy).toBe('admin');
    expect(rejected.response).toBe('Too dangerous');
  });

  it('cancels a pending request', async () => {
    const req = await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 'shell_execute', riskLevel: 'critical' });
    const cancelled = await approvalService.cancel(req.id);

    expect(cancelled.status).toBe('cancelled');
  });

  it('prevents approving an already-approved request', async () => {
    const req = await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 't', riskLevel: 'high' });
    await approvalService.approve(req.id);

    await expect(approvalService.approve(req.id)).rejects.toThrow("Cannot approve request in status 'approved'");
  });

  it('prevents rejecting an already-rejected request', async () => {
    const req = await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 't', riskLevel: 'high' });
    await approvalService.reject(req.id);

    await expect(approvalService.reject(req.id)).rejects.toThrow("Cannot reject request in status 'rejected'");
  });

  it('prevents cancelling a non-pending request', async () => {
    const req = await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 't', riskLevel: 'high' });
    await approvalService.approve(req.id);

    await expect(approvalService.cancel(req.id)).rejects.toThrow("Cannot cancel request in status 'approved'");
  });

  it('gets pending approvals for a mission', async () => {
    await approvalService.create({ missionId: 'm1', toolName: 't1', riskLevel: 'high' });
    await approvalService.create({ missionId: 'm1', toolName: 't2', riskLevel: 'critical' });
    await approvalService.create({ missionId: 'm2', toolName: 't3', riskLevel: 'high' });

    const pending = await approvalService.getPendingForMission('m1');
    expect(pending).toHaveLength(2);
  });

  it('expires stale pending requests', async () => {
    // Create a request with a past expiry
    const req = await db.approvalRequest.create({
      data: {
        missionId: TEST_MISSION_ID,
        toolName: 'old_tool',
        riskLevel: 'high',
        status: 'pending',
        expiresAt: new Date(Date.now() - 10000), // 10s ago
      },
    });

    const count = await approvalService.expirePending();
    expect(count).toBeGreaterThanOrEqual(1);

    const refreshed = await db.approvalRequest.findUnique({ where: { id: req.id } });
    expect(refreshed!.status).toBe('expired');
  });
});

// =================================================================
// 3. Approval Rules Engine
// =================================================================

describe('Phase 10 — Approval Rules Engine', () => {
  beforeEach(async () => {
    await db.approvalRequest.deleteMany();
    await db.approvalRule.deleteMany();
  });

  it('creates an approval rule', async () => {
    const rule = await approvalService.createRule({
      name: 'auto-approve-low-risk',
      description: 'Auto-approve all low risk tools',
      matchRiskLevels: ['low'],
      action: 'auto_approve',
      priority: 10,
    });

    expect(rule.id).toBeDefined();
    expect(rule.name).toBe('auto-approve-low-risk');
    expect(rule.action).toBe('auto_approve');
    expect(rule.priority).toBe(10);
    expect(rule.matchRiskLevels).toEqual(['low']);
    expect(rule.enabled).toBe(true);
  });

  it('rejects duplicate rule names', async () => {
    await approvalService.createRule({ name: 'dup', action: 'auto_approve' });
    await expect(approvalService.createRule({ name: 'dup', action: 'auto_reject' }))
      .rejects.toThrow('already exists');
  });

  it('lists rules', async () => {
    await approvalService.createRule({ name: 'r1', action: 'auto_approve' });
    await approvalService.createRule({ name: 'r2', action: 'auto_reject' });

    const rules = await approvalService.listRules();
    expect(rules).toHaveLength(2);
  });

  it('updates a rule', async () => {
    const rule = await approvalService.createRule({ name: 'upd', action: 'auto_approve' });
    const updated = await approvalService.updateRule(rule.id, {
      action: 'auto_reject',
      priority: 5,
      enabled: false,
    });

    expect(updated.action).toBe('auto_reject');
    expect(updated.priority).toBe(5);
    expect(updated.enabled).toBe(false);
  });

  it('deletes a rule', async () => {
    const rule = await approvalService.createRule({ name: 'del', action: 'auto_approve' });
    await approvalService.deleteRule(rule.id);

    const rules = await approvalService.listRules();
    expect(rules).toHaveLength(0);
  });

  it('auto-approves based on risk level rule', async () => {
    await approvalService.createRule({
      name: 'approve-low',
      matchRiskLevels: ['low'],
      action: 'auto_approve',
      priority: 10,
    });

    const result = await approvalService.checkAutoApproval('web_search', 'low');
    expect(result.autoApproved).toBe(true);
    expect(result.matchedRule).toBe('approve-low');
  });

  it('auto-rejects based on tool name pattern', async () => {
    await approvalService.createRule({
      name: 'block-shell',
      matchToolNames: ['shell_*'],
      action: 'auto_reject',
      priority: 100,
    });

    const result = await approvalService.checkAutoApproval('shell_execute', 'critical');
    expect(result.autoRejected).toBe(true);
    expect(result.matchedRule).toBe('block-shell');
  });

  it('matches tool name exactly', async () => {
    await approvalService.createRule({
      name: 'block-exact',
      matchToolNames: ['filesystem_delete'],
      action: 'auto_reject',
      priority: 50,
    });

    const result = await approvalService.checkAutoApproval('filesystem_delete', 'critical');
    expect(result.autoRejected).toBe(true);
  });

  it('matches capability rules', async () => {
    await approvalService.createRule({
      name: 'approve-fs-read',
      matchCapabilities: ['filesystem_read'],
      action: 'auto_approve',
      priority: 10,
    });

    const result = await approvalService.checkAutoApproval('filesystem_read', 'low', 'filesystem_read');
    expect(result.autoApproved).toBe(true);
  });

  it('higher priority rule wins', async () => {
    await approvalService.createRule({
      name: 'approve-all-high',
      matchRiskLevels: ['high'],
      action: 'auto_approve',
      priority: 100,
    });
    await approvalService.createRule({
      name: 'reject-all-high',
      matchRiskLevels: ['high'],
      action: 'auto_reject',
      priority: 1,
    });

    const result = await approvalService.checkAutoApproval('some_tool', 'high');
    expect(result.autoApproved).toBe(true);
    expect(result.matchedRule).toBe('approve-all-high');
  });

  it('disabled rules are skipped', async () => {
    const rule = await approvalService.createRule({
      name: 'disabled-approve',
      matchRiskLevels: ['low'],
      action: 'auto_approve',
    });
    await approvalService.updateRule(rule.id, { enabled: false });

    const result = await approvalService.checkAutoApproval('some_tool', 'low');
    expect(result.autoApproved).toBe(false);
    expect(result.autoRejected).toBe(false);
  });

  it('require_manual rule blocks auto-approval', async () => {
    await approvalService.createRule({
      name: 'manual-critical',
      matchRiskLevels: ['critical'],
      action: 'require_manual',
      priority: 50,
    });

    const result = await approvalService.checkAutoApproval('shell_execute', 'critical');
    expect(result.autoApproved).toBe(false);
    expect(result.autoRejected).toBe(false);
    expect(result.matchedRule).toBe('manual-critical');
  });

  it('rule with no conditions matches everything', async () => {
    await approvalService.createRule({
      name: 'match-all',
      action: 'auto_approve',
      priority: 0,
    });

    const result = await approvalService.checkAutoApproval('anything', 'any_level');
    expect(result.autoApproved).toBe(true);
  });
});

// =================================================================
// 4. Approval Gate
// =================================================================

describe('Phase 10 — Approval Gate', () => {
  beforeEach(async () => {
    await db.approvalRequest.deleteMany();
    await db.approvalRule.deleteMany();
  });

  it('allows low-risk tools without approval', async () => {
    const result = await checkApprovalGate({
      toolName: 'web_search',
      riskLevel: 'low',
      toolInput: { query: 'test' },
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.proceed).toBe(true);
  });

  it('allows medium-risk tools without approval (no hard-blocked capability)', async () => {
    const result = await checkApprovalGate({
      toolName: 'screenshot',
      riskLevel: 'medium',
      capability: 'screenshot',
      toolInput: {},
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.proceed).toBe(true);
  });

  it('requires approval for hard-blocked capabilities', async () => {
    const result = await checkApprovalGate({
      toolName: 'shell_execute',
      riskLevel: 'critical',
      capability: 'shell_execute',
      toolInput: { command: 'rm -rf /' },
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.proceed).toBe(false);
    expect(result.status).toBe('waiting_approval');
    expect(result.approvalId).toBeDefined();
  });

  it('requires approval for high-risk tools', async () => {
    const result = await checkApprovalGate({
      toolName: 'some_high_risk_tool',
      riskLevel: 'high',
      toolInput: {},
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.proceed).toBe(false);
    expect(result.status).toBe('waiting_approval');
    expect(result.approvalId).toBeDefined();
  });

  it('requires approval for critical-risk tools', async () => {
    const result = await checkApprovalGate({
      toolName: 'filesystem_delete',
      riskLevel: 'critical',
      capability: 'filesystem_delete',
      toolInput: { path: '/important' },
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.proceed).toBe(false);
    expect(result.status).toBe('waiting_approval');
  });

  it('auto-approve rule overrides hard-block', async () => {
    await approvalService.createRule({
      name: 'auto-approve-shell',
      matchCapabilities: ['shell_execute'],
      action: 'auto_approve',
      priority: 100,
    });

    const result = await checkApprovalGate({
      toolName: 'shell_execute',
      riskLevel: 'critical',
      capability: 'shell_execute',
      toolInput: { command: 'echo hello' },
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.proceed).toBe(true);
  });

  it('auto-reject rule blocks tool execution', async () => {
    await approvalService.createRule({
      name: 'block-all-critical',
      matchRiskLevels: ['critical'],
      action: 'auto_reject',
      priority: 100,
    });

    const result = await checkApprovalGate({
      toolName: 'dangerous_tool',
      riskLevel: 'critical',
      toolInput: {},
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.proceed).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('Auto-rejected');
  });

  it('creates DB record for approval request', async () => {
    const result = await checkApprovalGate({
      toolName: 'shell_execute',
      riskLevel: 'critical',
      capability: 'shell_execute',
      toolInput: { command: 'ls' },
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.approvalId).toBeDefined();

    const dbReq = await db.approvalRequest.findUnique({ where: { id: result.approvalId! } });
    expect(dbReq).toBeDefined();
    expect(dbReq!.toolName).toBe('shell_execute');
    expect(dbReq!.status).toBe('pending');
  });
});

// =================================================================
// 5. Stats & Edge Cases
// =================================================================

describe('Phase 10 — Stats & Edge Cases', () => {
  beforeEach(async () => {
    await db.approvalRequest.deleteMany();
    await db.approvalRule.deleteMany();
  });

  it('returns correct stats', async () => {
    const r1 = await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 't1', riskLevel: 'high' });
    const r2 = await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 't2', riskLevel: 'high' });
    const r3 = await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 't3', riskLevel: 'high' });

    await approvalService.approve(r1.id);
    await approvalService.reject(r2.id);
    await approvalService.cancel(r3.id);

    const stats = await approvalService.getStats();
    expect(stats.total).toBe(3);
    expect(stats.pending).toBe(0);
    expect(stats.approved).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.cancelled).toBe(1);
  });

  it('returns zero stats when empty', async () => {
    const stats = await approvalService.getStats();
    expect(stats.total).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.approved).toBe(0);
    expect(stats.rejected).toBe(0);
    expect(stats.expired).toBe(0);
    expect(stats.cancelled).toBe(0);
  });

  it('uses default TTL for approval requests', async () => {
    const req = await approvalService.create({
      missionId: TEST_MISSION_ID,
      toolName: 't',
      riskLevel: 'high',
    });

    // Should have an expiry time set (default 300s from now)
    expect(req.expiresAt).toBeDefined();
    const expiresAt = new Date(req.expiresAt!).getTime();
    const now = Date.now();
    // Should be roughly 300 seconds in the future (within 10s tolerance)
    expect(expiresAt - now).toBeGreaterThan(290000);
    expect(expiresAt - now).toBeLessThan(310000);
  });

  it('respects custom TTL', async () => {
    const req = await approvalService.create({
      missionId: TEST_MISSION_ID,
      toolName: 't',
      riskLevel: 'high',
      ttlSeconds: 60,
    });

    const expiresAt = new Date(req.expiresAt!).getTime();
    const now = Date.now();
    expect(expiresAt - now).toBeGreaterThan(50000);
    expect(expiresAt - now).toBeLessThan(70000);
  });

  it('approval with no optional fields works', async () => {
    const req = await approvalService.create({
      missionId: TEST_MISSION_ID,
      toolName: 'minimal_tool',
      riskLevel: 'medium',
    });

    expect(req.id).toBeDefined();
    expect(req.status).toBe('pending');
    expect(req.capability).toBeUndefined();
    expect(req.reason).toBeUndefined();
    expect(req.toolInput).toBeUndefined();
  });

  it('approve/reject with no response works', async () => {
    const req = await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 't', riskLevel: 'high' });

    const approved = await approvalService.approve(req.id);
    expect(approved.response).toBeUndefined();

    const req2 = await approvalService.create({ missionId: TEST_MISSION_ID, toolName: 't2', riskLevel: 'high' });
    const rejected = await approvalService.reject(req2.id);
    expect(rejected.response).toBeUndefined();
  });

  it('combined condition rules work (risk + tool name)', async () => {
    await approvalService.createRule({
      name: 'approve-screenshot-low',
      matchRiskLevels: ['low'],
      matchToolNames: ['screenshot'],
      action: 'auto_approve',
    });

    // Both conditions match
    const result1 = await approvalService.checkAutoApproval('screenshot', 'low');
    expect(result1.autoApproved).toBe(true);

    // Only risk matches, not tool name
    const result2 = await approvalService.checkAutoApproval('other_tool', 'low');
    expect(result2.autoApproved).toBe(false);

    // Only tool matches, not risk
    const result3 = await approvalService.checkAutoApproval('screenshot', 'high');
    expect(result3.autoApproved).toBe(false);
  });
});
