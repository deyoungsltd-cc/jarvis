/**
 * Clipboard tools — read and write the system clipboard.
 */
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { getPermissionManager } from '../../permissions/permissionManager.js';

export function createClipboardReadTool(): ToolHandler {
  return {
    name: 'clipboard_read',
    description: 'Read the current clipboard contents.',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
      },
    },
    riskLevel: 'medium',
    async execute(_input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('clipboard_read');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      return {
        success: false,
        output: { content: null, available: false },
        error: 'ENVIRONMENT_UNAVAILABLE: No clipboard service',
        durationMs: 0,
      };
    },
  };
}

export function createClipboardWriteTool(): ToolHandler {
  return {
    name: 'clipboard_write',
    description: 'Write content to the system clipboard.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Content to write to clipboard' },
      },
      required: ['content'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        written: { type: 'boolean' },
      },
    },
    riskLevel: 'high',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('clipboard_write');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      return {
        success: false,
        output: { written: false, available: false },
        error: 'ENVIRONMENT_UNAVAILABLE: No clipboard service',
        durationMs: 0,
      };
    },
  };
}
