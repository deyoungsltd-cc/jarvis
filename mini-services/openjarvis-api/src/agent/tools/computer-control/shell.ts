/**
 * Shell execution tool — run commands.
 * HARD-BLOCKED: requires approval (Phase 9).
 */
import { execSync } from 'child_process';
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { getPermissionManager } from '../../permissions/permissionManager.js';

export function createShellExecuteTool(): ToolHandler {
  return {
    name: 'shell_execute',
    description: 'Execute a shell command. HARD-BLOCKED: requires approval (Phase 9). Returns requires_approval and halts.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
      },
      required: ['command'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        exitCode: { type: 'number' }, stdout: { type: 'string' }, stderr: { type: 'string' },
      },
    },
    riskLevel: 'critical',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      // HARD-BLOCKED
      const perms = getPermissionManager();
      const check = perms.check('shell_execute');
      if (!check.allowed) {
        return {
          success: false,
          output: { exitCode: null, stdout: null, stderr: null, requiresApproval: true },
          error: check.reason, // "requires_approval"
          durationMs: 0,
        };
      }

      // Even if granted, refuse until Phase 9
      return {
        success: false,
        output: { exitCode: null, stdout: null, stderr: null, requiresApproval: true },
        error: 'requires_approval: Shell execution requires human approval via the approval queue (Phase 9)',
        durationMs: 0,
      };
    },
  };
}
