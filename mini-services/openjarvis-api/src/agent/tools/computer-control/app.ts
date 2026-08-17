/**
 * App tools — launch and close applications.
 */
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { getPermissionManager } from '../../permissions/permissionManager.js';

export function createAppLaunchTool(): ToolHandler {
  return {
    name: 'app_launch',
    description: 'Launch an application by name or path.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Application name or path' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command-line arguments' },
      },
      required: ['app'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        launched: { type: 'boolean' }, pid: { type: 'number' },
      },
    },
    riskLevel: 'medium',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('app_launch');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      return {
        success: false,
        output: { launched: false, available: false },
        error: 'ENVIRONMENT_UNAVAILABLE: No display server',
        durationMs: 0,
      };
    },
  };
}

export function createAppCloseTool(): ToolHandler {
  return {
    name: 'app_close',
    description: 'Close an application. Triggers a verification loop after execution.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Application name or PID' },
      },
      required: ['app'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        closed: { type: 'boolean' }, verified: { type: 'boolean' },
      },
    },
    riskLevel: 'high',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      // app_close requires approval
      const perms = getPermissionManager();
      const check = perms.check('app_close');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      return {
        success: false,
        output: { closed: false, verified: false, available: false },
        error: 'ENVIRONMENT_UNAVAILABLE: No display server',
        durationMs: 0,
      };
    },
  };
}
