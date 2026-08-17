/*
 * Phase 10 Authorization Model Tests
 *
 * Tests the "admin is the policy" authorization model:
 *  1. Capability Registry CRUD: grant, list, update, revoke, revokeAll
 *  2. Three-state check: allowed / denied / undefined
 *  3. Scoped grants: permanent, mission, session
 *  4. Scope context matching (pathPrefix, domain)
 *  5. Approval Gate integration: registry overrides risk-level fallback
 *  6. Approve once vs always-allow: creates permanent grant
 *  7. Revocation takes immediate effect
 *  8. Edge cases: undefined ≠ denied, no silent refusal
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { capabilityRegistry } from '../src/services/capabilityRegistry.js';
import { checkApprovalGate } from '../src/services/approvalGate.js';
import { approvalService } from '../src/services/approvalService.js';
import { db } from '../src/utils/db.js';

const TEST_MISSION_ID = 'test-mission-auth-model';

// =================================================================
// 1. Capability Registry CRUD
// =================================================================

describe('Authorization Model — Capability Registry CRUD', () => {
  beforeEach(async () => {
    await db.capabilityGrant.deleteMany();
    await db.approvalRequest.deleteMany();
    await db.approvalRule.deleteMany();
  });

  it('creates a permanent allow grant', async () => {
    const grant = await capabilityRegistry.grant({
      capability: 'filesystem_write',
      allowed: true,
      scopeType: 'permanent',
      source: 'manual',
    });

    expect(grant.id).toBeDefined();
    expect(grant.capability).toBe('filesystem_write');
    expect(grant.allowed).toBe(true);
    expect(grant.scopeType).toBe('permanent');
    expect(grant.source).toBe('manual');
    expect(grant.createdAt).toBeDefined();
  });

  it('creates a permanent deny grant', async () => {
    const grant = await capabilityRegistry.grant({
      capability: 'shell_execute',
      allowed: false,
      scopeType: 'permanent',
    });

    expect(grant.allowed).toBe(false);
  });

  it('creates a scoped grant with context', async () => {
    const grant = await capabilityRegistry.grant({
      capability: 'filesystem_write',
      allowed: true,
      scopeType: 'permanent',
      scopeContext: { pathPrefix: '/projects/' },
    });

    expect(grant.scopeContext).toEqual({ pathPrefix: '/projects/' });
  });

  it('creates a mission-scoped grant', async () => {
    const grant = await capabilityRegistry.grant({
      capability: 'filesystem_write',
      allowed: true,
      scopeType: 'mission',
      missionId: TEST_MISSION_ID,
    });

    expect(grant.scopeType).toBe('mission');
    expect(grant.missionId).toBe(TEST_MISSION_ID);
  });

  it('lists grants with filters', async () => {
    await capabilityRegistry.grant({ capability: 'cap_a', allowed: true });
    await capabilityRegistry.grant({ capability: 'cap_b', allowed: false });

    const allowed = await capabilityRegistry.list({ allowed: true });
    expect(allowed.total).toBe(1);
    expect(allowed.items[0].capability).toBe('cap_a');

    const denied = await capabilityRegistry.list({ allowed: false });
    expect(denied.total).toBe(1);
  });

  it('updates a grant', async () => {
    const grant = await capabilityRegistry.grant({ capability: 'cap', allowed: false });
    const updated = await capabilityRegistry.update(grant.id, { allowed: true });

    expect(updated.allowed).toBe(true);
  });

  it('revokes a grant', async () => {
    const grant = await capabilityRegistry.grant({ capability: 'cap', allowed: true });
    const result = await capabilityRegistry.revoke(grant.id);

    expect(result.revoked).toBe(true);
    expect(result.capability).toBe('cap');

    // Verify it's gone
    const status = await capabilityRegistry.check('cap');
    expect(status.status).toBe('undefined');
  });

  it('revokes all grants for a capability', async () => {
    await capabilityRegistry.grant({ capability: 'cap', allowed: true });
    await capabilityRegistry.grant({ capability: 'cap', allowed: false, scopeType: 'mission', missionId: 'm1' });

    const result = await capabilityRegistry.revokeAll('cap');
    expect(result.count).toBe(2);

    const status = await capabilityRegistry.check('cap');
    expect(status.status).toBe('undefined');
  });

  it('gets all capability statuses', async () => {
    await capabilityRegistry.grant({ capability: 'cap_a', allowed: true });
    await capabilityRegistry.grant({ capability: 'cap_b', allowed: false });

    const statuses = await capabilityRegistry.getAllStatuses();
    expect(statuses['cap_a'].status).toBe('allowed');
    expect(statuses['cap_b'].status).toBe('denied');
    expect(statuses['cap_c']).toBeUndefined(); // no grant = not in map
  });
});

// =================================================================
// 2. Three-State Check: allowed / denied / undefined
// =================================================================

describe('Authorization Model — Three-State Check', () => {
  beforeEach(async () => {
    await db.capabilityGrant.deleteMany();
    await db.approvalRequest.deleteMany();
    await db.approvalRule.deleteMany();
  });

  it('returns UNDEFINED for capability with no grant', async () => {
    const result = await capabilityRegistry.check('filesystem_write');
    expect(result.status).toBe('undefined');
    expect(result.reason).toContain('no grant');
  });

  it('returns ALLOWED for explicitly granted capability', async () => {
    await capabilityRegistry.grant({ capability: 'filesystem_write', allowed: true });

    const result = await capabilityRegistry.check('filesystem_write');
    expect(result.status).toBe('allowed');
    expect(result.grantId).toBeDefined();
  });

  it('returns DENIED for explicitly denied capability', async () => {
    await capabilityRegistry.grant({ capability: 'shell_execute', allowed: false });

    const result = await capabilityRegistry.check('shell_execute');
    expect(result.status).toBe('denied');
    expect(result.grantId).toBeDefined();
    expect(result.reason).toContain('denies');
  });

  it('undefined is NOT the same as denied', async () => {
    // This is the critical spec requirement
    const undefinedResult = await capabilityRegistry.check('nonexistent_cap');
    const deniedResult = await (async () => {
      await capabilityRegistry.grant({ capability: 'nonexistent_cap', allowed: false });
      return capabilityRegistry.check('nonexistent_cap');
    })();

    // Both prevent execution, but the CALLER should treat them differently:
    // - undefined → pause and ask
    // - denied → block
    expect(undefinedResult.status).toBe('undefined');
    expect(deniedResult.status).toBe('denied');
    expect(undefinedResult.reason).toContain('Pausing to ask');
    expect(deniedResult.reason).toContain('denies');
  });
});

// =================================================================
// 3. Scoped Grants
// =================================================================

describe('Authorization Model — Scoped Grants', () => {
  beforeEach(async () => {
    await db.capabilityGrant.deleteMany();
    await db.approvalRequest.deleteMany();
    await db.approvalRule.deleteMany();
  });

  it('mission-scoped grant only applies to that mission', async () => {
    await capabilityRegistry.grant({
      capability: 'filesystem_write',
      allowed: true,
      scopeType: 'mission',
      missionId: 'mission-1',
    });

    // Should be allowed for mission-1
    const result1 = await capabilityRegistry.check('filesystem_write', { missionId: 'mission-1' });
    expect(result1.status).toBe('allowed');

    // Should be UNDEFINED for mission-2 (different mission)
    const result2 = await capabilityRegistry.check('filesystem_write', { missionId: 'mission-2' });
    expect(result2.status).toBe('undefined');
  });

  it('mission-scoped grant overrides permanent grant for that mission', async () => {
    // Permanent: denied
    await capabilityRegistry.grant({ capability: 'filesystem_write', allowed: false, scopeType: 'permanent' });
    // Mission: allowed
    await capabilityRegistry.grant({ capability: 'filesystem_write', allowed: true, scopeType: 'mission', missionId: 'mission-1' });

    // For mission-1, the mission-scoped grant should win
    const result1 = await capabilityRegistry.check('filesystem_write', { missionId: 'mission-1' });
    expect(result1.status).toBe('allowed');

    // For mission-2, the permanent denied should apply
    const result2 = await capabilityRegistry.check('filesystem_write', { missionId: 'mission-2' });
    expect(result2.status).toBe('denied');
  });
});

// =================================================================
// 4. Scope Context Matching
// =================================================================

describe('Authorization Model — Scope Context', () => {
  beforeEach(async () => {
    await db.capabilityGrant.deleteMany();
    await db.approvalRequest.deleteMany();
    await db.approvalRule.deleteMany();
  });

  it('pathPrefix scope matches correctly', async () => {
    await capabilityRegistry.grant({
      capability: 'filesystem_write',
      allowed: true,
      scopeContext: { pathPrefix: '/projects/' },
    });

    // Matching path
    const match = await capabilityRegistry.check('filesystem_write', {
      toolInput: { path: '/projects/my-app/main.ts' },
    });
    expect(match.status).toBe('allowed');

    // Non-matching path → undefined behavior (scope didn't match)
    const noMatch = await capabilityRegistry.check('filesystem_write', {
      toolInput: { path: '/etc/passwd' },
    });
    expect(noMatch.status).toBe('undefined');
  });

  it('grant without scope context matches everything', async () => {
    await capabilityRegistry.grant({ capability: 'filesystem_write', allowed: true });

    const result = await capabilityRegistry.check('filesystem_write', {
      toolInput: { path: '/any/path/at/all' },
    });
    expect(result.status).toBe('allowed');
  });

  it('domain scope matches URLs', async () => {
    await capabilityRegistry.grant({
      capability: 'web_search',
      allowed: true,
      scopeContext: { domain: 'docs.example.com' },
    });

    const match = await capabilityRegistry.check('web_search', {
      toolInput: { url: 'https://docs.example.com/api' },
    });
    expect(match.status).toBe('allowed');

    const noMatch = await capabilityRegistry.check('web_search', {
      toolInput: { url: 'https://evil.com' },
    });
    expect(noMatch.status).toBe('undefined');
  });
});

// =================================================================
// 5. Approval Gate Integration
// =================================================================

describe('Authorization Model — Approval Gate Integration', () => {
  beforeEach(async () => {
    await db.capabilityGrant.deleteMany();
    await db.approvalRequest.deleteMany();
    await db.approvalRule.deleteMany();
  });

  it('capability ALLOWED in registry → gate proceeds without asking', async () => {
    await capabilityRegistry.grant({ capability: 'shell_execute', allowed: true });

    const result = await checkApprovalGate({
      toolName: 'shell_execute',
      riskLevel: 'critical',
      capability: 'shell_execute',
      toolInput: { command: 'ls' },
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.proceed).toBe(true);
  });

  it('capability DENIED in registry → gate blocks immediately', async () => {
    await capabilityRegistry.grant({ capability: 'shell_execute', allowed: false });

    const result = await checkApprovalGate({
      toolName: 'shell_execute',
      riskLevel: 'critical',
      capability: 'shell_execute',
      toolInput: { command: 'rm -rf /' },
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.proceed).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('explicitly denied');
  });

  it('capability UNDEFINED → gate creates approval request (pause and ask)', async () => {
    const result = await checkApprovalGate({
      toolName: 'shell_execute',
      riskLevel: 'critical',
      capability: 'shell_execute',
      toolInput: { command: 'echo hello' },
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.proceed).toBe(false);
    expect(result.status).toBe('waiting_approval');
    expect(result.approvalId).toBeDefined();
    expect(result.reason).toContain('not yet granted');
  });

  it('tool without capability uses risk-level fallback (low → proceed)', async () => {
    const result = await checkApprovalGate({
      toolName: 'web_search',
      riskLevel: 'low',
      toolInput: { query: 'test' },
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.proceed).toBe(true);
  });

  it('tool without capability but high risk → pause and ask', async () => {
    const result = await checkApprovalGate({
      toolName: 'some_custom_tool',
      riskLevel: 'high',
      toolInput: {},
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.proceed).toBe(false);
    expect(result.status).toBe('waiting_approval');
  });

  it('auto-approval rule still overrides registry (highest priority)', async () => {
    // Even though capability is denied, an auto-approve rule wins
    await capabilityRegistry.grant({ capability: 'shell_execute', allowed: false });
    await approvalService.createRule({
      name: 'override-rule',
      matchCapabilities: ['shell_execute'],
      action: 'auto_approve',
      priority: 100,
    });

    const result = await checkApprovalGate({
      toolName: 'shell_execute',
      riskLevel: 'critical',
      capability: 'shell_execute',
      toolInput: {},
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });

    expect(result.proceed).toBe(true);
  });
});

// =================================================================
// 6. Approve Once vs Always Allow
// =================================================================

describe('Authorization Model — Approve Once vs Always Allow', () => {
  beforeEach(async () => {
    await db.capabilityGrant.deleteMany();
    await db.approvalRequest.deleteMany();
    await db.approvalRule.deleteMany();
  });

  it('approve once does NOT create a capability grant', async () => {
    const req = await approvalService.create({
      missionId: TEST_MISSION_ID,
      toolName: 'shell_execute',
      capability: 'shell_execute',
      riskLevel: 'critical',
    });

    await approvalService.approve(req.id, 'admin', undefined, 'test', { alwaysAllow: false });

    // Capability should still be undefined
    const capStatus = await capabilityRegistry.check('shell_execute');
    expect(capStatus.status).toBe('undefined');

    // Next time, should still need approval
    const grants = await capabilityRegistry.list({ capability: 'shell_execute' });
    expect(grants.total).toBe(0);
  });

  it('always allow creates a permanent capability grant', async () => {
    const req = await approvalService.create({
      missionId: TEST_MISSION_ID,
      toolName: 'shell_execute',
      capability: 'shell_execute',
      riskLevel: 'critical',
    });

    await approvalService.approve(req.id, 'admin', undefined, 'test', { alwaysAllow: true });

    // Capability should now be ALLOWED
    const capStatus = await capabilityRegistry.check('shell_execute');
    expect(capStatus.status).toBe('allowed');

    // Should have a grant in the registry
    const grants = await capabilityRegistry.list({ capability: 'shell_execute' });
    expect(grants.total).toBe(1);
    expect(grants.items[0].allowed).toBe(true);
    expect(grants.items[0].scopeType).toBe('permanent');
    expect(grants.items[0].source).toBe('approval_always_allow');
    expect(grants.items[0].approvalRequestId).toBe(req.id);
  });

  it('after always-allow, subsequent gate checks proceed without asking', async () => {
    const req = await approvalService.create({
      missionId: TEST_MISSION_ID,
      toolName: 'shell_execute',
      capability: 'shell_execute',
      riskLevel: 'critical',
    });

    await approvalService.approve(req.id, 'admin', undefined, 'test', { alwaysAllow: true });

    // Second gate check should proceed immediately
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

  it('approval for tool without capability cannot create grant (no-op)', async () => {
    const req = await approvalService.create({
      missionId: TEST_MISSION_ID,
      toolName: 'some_custom_tool',
      riskLevel: 'high',
      // no capability!
    });

    await approvalService.approve(req.id, 'admin', undefined, 'test', { alwaysAllow: true });

    // No grant should have been created (no capability to grant)
    const grants = await capabilityRegistry.list();
    expect(grants.total).toBe(0);
  });
});

// =================================================================
// 7. Revocation Takes Immediate Effect
// =================================================================

describe('Authorization Model — Immediate Revocation', () => {
  beforeEach(async () => {
    await db.capabilityGrant.deleteMany();
    await db.approvalRequest.deleteMany();
    await db.approvalRule.deleteMany();
  });

  it('revoking a grant immediately blocks the capability', async () => {
    const grant = await capabilityRegistry.grant({ capability: 'shell_execute', allowed: true });

    // Verify it's allowed
    const before = await capabilityRegistry.check('shell_execute');
    expect(before.status).toBe('allowed');

    // Revoke
    await capabilityRegistry.revoke(grant.id);

    // Now it should be undefined
    const after = await capabilityRegistry.check('shell_execute');
    expect(after.status).toBe('undefined');
  });

  it('changing a grant from allowed to denied takes immediate effect', async () => {
    const grant = await capabilityRegistry.grant({ capability: 'filesystem_write', allowed: true });

    await capabilityRegistry.update(grant.id, { allowed: false });

    const result = await capabilityRegistry.check('filesystem_write');
    expect(result.status).toBe('denied');
  });

  it('gate respects revocation mid-mission', async () => {
    // Grant, verify gate proceeds, revoke, verify gate blocks
    const grant = await capabilityRegistry.grant({ capability: 'shell_execute', allowed: true });

    let result = await checkApprovalGate({
      toolName: 'shell_execute',
      riskLevel: 'critical',
      capability: 'shell_execute',
      toolInput: {},
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });
    expect(result.proceed).toBe(true);

    // Admin revokes
    await capabilityRegistry.revoke(grant.id);

    // Next check in the same mission should pause
    result = await checkApprovalGate({
      toolName: 'shell_execute',
      riskLevel: 'critical',
      capability: 'shell_execute',
      toolInput: {},
      missionId: TEST_MISSION_ID,
      requestId: 'test',
    });
    expect(result.proceed).toBe(false);
    expect(result.status).toBe('waiting_approval');
  });
});
