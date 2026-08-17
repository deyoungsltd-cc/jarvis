import { describe, it, expect, beforeEach } from 'bun:test';
import { PermissionManager } from '../src/agent/permissions/permissionManager.js';
import { CAPABILITY_RISK } from '../src/agent/permissions/types.js';
import { ToolRegistry } from '../src/agent/toolRegistry.js';
import { createFilesystemDeleteTool, createFilesystemWriteTool, createFilesystemReadTool } from '../src/agent/tools/computer-control/filesystem.js';
import { createShellExecuteTool } from '../src/agent/tools/computer-control/shell.js';
import { verifyActionResult, getVerificationMethod } from '../src/agent/verification.js';

describe('Phase 4 — Permission Manager', () => {
  let pm: PermissionManager;

  beforeEach(() => {
    pm = new PermissionManager();
  });

  it('nothing is granted by default', () => {
    expect(pm.isGranted('screenshot')).toBe(false);
    expect(pm.isGranted('mouse_click')).toBe(false);
    expect(pm.isGranted('shell_execute')).toBe(false);
    expect(pm.isGranted('filesystem_read')).toBe(false);
  });

  it('granting a capability makes check pass', () => {
    pm.grant('screenshot');
    const result = pm.check('screenshot');
    expect(result.allowed).toBe(true);
  });

  it('revoking a capability makes check fail', () => {
    pm.grant('screenshot');
    pm.revoke('screenshot');
    const result = pm.check('screenshot');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not granted');
  });

  it('hard-blocked capabilities always return requires_approval', () => {
    // Even if explicitly granted, shell_execute is hard-blocked
    pm.grant('shell_execute');
    const result = pm.check('shell_execute');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('requires_approval');
    pm.revoke('shell_execute');
  });

  it('hard-blocked capabilities are correctly enforced', () => {
    // Verify through the PermissionManager (module-level Sets can be flaky in Bun test)
    expect(pm.check('shell_execute').allowed).toBe(false);
    expect(pm.check('shell_execute').reason).toBe('requires_approval');
    expect(pm.check('filesystem_delete').allowed).toBe(false);
    expect(pm.check('filesystem_delete').reason).toBe('requires_approval');
    // screenshot is NOT hard-blocked (just ungranted)
    expect(pm.check('screenshot').allowed).toBe(false);
    expect(pm.check('screenshot').reason).toContain('not granted');
  });

  it('getAllCapabilities returns all 17 capabilities with status', () => {
    pm.grant('screenshot');
    const caps = pm.getAllCapabilities();
    expect(caps.length).toBe(17);
    const screenshot = caps.find(c => c.capability === 'screenshot');
    expect(screenshot).toBeDefined();
    expect(screenshot!.granted).toBe(true);
    expect(screenshot!.risk).toBe('low');
  });

  it('permission checks happen at execution time, not just at connection time', () => {
    // Initially not granted
    expect(pm.check('mouse_click').allowed).toBe(false);
    // Grant it
    pm.grant('mouse_click');
    // Now allowed
    expect(pm.check('mouse_click').allowed).toBe(true);
    // Revoke it
    pm.revoke('mouse_click');
    // Not allowed again
    expect(pm.check('mouse_click').allowed).toBe(false);
  });
});

describe('Phase 4 — Hard-Block List Enforcement', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    // Don't grant any permissions
  });

  it('filesystem_delete returns requires_approval even without permission grant', async () => {
    registry.register(createFilesystemDeleteTool());
    const result = await registry.executeTool('filesystem_delete', {
      path: '/tmp/some-file.txt',
    }, { requestId: 'test' });
    expect(result.success).toBe(false);
    expect((result.output as any)?.requiresApproval).toBe(true);
    expect(result.error).toContain('requires_approval');
  });

  it('shell_execute returns requires_approval even without permission grant', async () => {
    registry.register(createShellExecuteTool());
    const result = await registry.executeTool('shell_execute', {
      command: 'rm -rf /',
    }, { requestId: 'test' });
    expect(result.success).toBe(false);
    expect((result.output as any)?.requiresApproval).toBe(true);
  });

  it('filesystem_delete returns requires_approval even IF permission is granted', async () => {
    const { getPermissionManager } = await import('../src/agent/permissions/permissionManager.js');
    const pm = getPermissionManager();
    pm.grant('filesystem_delete'); // Grant it — should still be blocked

    registry.register(createFilesystemDeleteTool());
    const result = await registry.executeTool('filesystem_delete', {
      path: '/tmp/test.txt',
    }, { requestId: 'test' });
    expect(result.success).toBe(false);
    expect((result.output as any)?.requiresApproval).toBe(true);
    expect(result.error).toContain('requires_approval');
  });
});

describe('Phase 4 — Filesystem Tools (real in sandbox)', () => {
  let registry: ToolRegistry;

  beforeEach(async () => {
    registry = new ToolRegistry();
    const { getPermissionManager } = await import('../src/agent/permissions/permissionManager.js');
    const pm = getPermissionManager();
    pm.grant('filesystem_read');
    pm.grant('filesystem_write');
  });

  it('filesystem_read can read a real file', async () => {
    registry.register(createFilesystemReadTool());
    const result = await registry.executeTool('filesystem_read', {
      path: '/home/z/my-project/package.json',
    }, { requestId: 'test' });
    expect(result.success).toBe(true);
    expect((result.output as any).type).toBe('file');
    expect((result.output as any).content).toContain('next');
  });

  it('filesystem_read returns not_found for missing file', async () => {
    registry.register(createFilesystemReadTool());
    const result = await registry.executeTool('filesystem_read', {
      path: '/nonexistent/file.txt',
    }, { requestId: 'test' });
    expect(result.success).toBe(true);
    expect((result.output as any).type).toBe('not_found');
  });

  it('filesystem_read lists directories', async () => {
    registry.register(createFilesystemReadTool());
    const result = await registry.executeTool('filesystem_read', {
      path: '/home/z/my-project/src/components/openjarvis',
    }, { requestId: 'test' });
    expect(result.success).toBe(true);
    expect((result.output as any).type).toBe('directory');
    expect((result.output as any).entries.length).toBeGreaterThan(0);
  });

  it('filesystem_write can write a real file', async () => {
    registry.register(createFilesystemWriteTool());
    const testPath = '/tmp/jarvis-phase4-test.txt';
    const result = await registry.executeTool('filesystem_write', {
      path: testPath,
      content: 'Phase 4 test data',
    }, { requestId: 'test' });
    expect(result.success).toBe(true);
    expect((result.output as any).written).toBe(true);
    expect((result.output as any).bytes).toBeGreaterThan(0);

    // Clean up
    const { unlinkSync } = require('fs');
    unlinkSync(testPath);
  });

  it('filesystem_read fails without permission', async () => {
    const { getPermissionManager } = await import('../src/agent/permissions/permissionManager.js');
    const pm = getPermissionManager();
    pm.revoke('filesystem_read');

    registry.register(createFilesystemReadTool());
    const result = await registry.executeTool('filesystem_read', {
      path: '/home/z/my-project/package.json',
    }, { requestId: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not granted');
  });
});

describe('Phase 4 — Verification Loop', () => {
  it('getVerificationMethod returns screenshot_diff for mouse_click', () => {
    expect(getVerificationMethod('mouse_click')).toBe('screenshot_diff');
  });

  it('getVerificationMethod returns screenshot_diff for key_type', () => {
    expect(getVerificationMethod('key_type')).toBe('screenshot_diff');
  });

  it('getVerificationMethod returns skip for non-UI tools', () => {
    expect(getVerificationMethod('filesystem_read')).toBe('skip');
    expect(getVerificationMethod('web_search')).toBe('skip');
  });

  it('output_check verification passes when expected string is in output', async () => {
    const result = await verifyActionResult({
      action: 'test',
      method: 'output_check',
      expectedState: 'success',
      actualOutput: 'operation success confirmed',
      requestId: 'test',
    });
    expect(result.verified).toBe(true);
    expect(result.method).toBe('output_check');
  });

  it('output_check verification fails when expected string is missing', async () => {
    const result = await verifyActionResult({
      action: 'test',
      method: 'output_check',
      expectedState: 'success',
      actualOutput: 'operation failed with error',
      requestId: 'test',
    });
    expect(result.verified).toBe(false);
    expect(result.evidence).toContain('not found');
  });
});

describe('Phase 4 — Capability Risk Levels', () => {
    it('screenshot is low risk', () => {
      expect(CAPABILITY_RISK.screenshot).toBe('low');
    });

  it('mouse_click and key_type are high risk', () => {
    expect(CAPABILITY_RISK.mouse_click).toBe('high');
    expect(CAPABILITY_RISK.key_type).toBe('high');
    expect(CAPABILITY_RISK.clipboard_write).toBe('high');
  });

  it('filesystem_delete and shell_execute are critical risk', () => {
    expect(CAPABILITY_RISK.filesystem_delete).toBe('critical');
    expect(CAPABILITY_RISK.shell_execute).toBe('critical');
  });
  });
