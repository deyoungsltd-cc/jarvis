/**
 * Mouse tools — move, click, scroll.
 * Permission-gated, verification-loop after clicks.
 */
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { getPermissionManager } from '../../permissions/permissionManager.js';

export function createMouseMoveTool(): ToolHandler {
  return {
    name: 'mouse_move',
    description: 'Move the mouse cursor to absolute screen coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in pixels' },
        y: { type: 'number', description: 'Y coordinate in pixels' },
      },
      required: ['x', 'y'],
    },
    outputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
    riskLevel: 'medium',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('mouse_move');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      return {
        success: false,
        output: { x: input.x, y: input.y, available: false },
        error: 'ENVIRONMENT_UNAVAILABLE: No display server',
        durationMs: 0,
      };
    },
  };
}

export function createMouseClickTool(): ToolHandler {
  return {
    name: 'mouse_click',
    description: 'Click the mouse at the current cursor position (or specified coordinates). After clicking, a verification check runs to confirm the action succeeded.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Optional X coordinate' },
        y: { type: 'number', description: 'Optional Y coordinate' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default: left)' },
        doubleClick: { type: 'boolean', description: 'Double click (default: false)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        clicked: { type: 'boolean' },
        verified: { type: 'boolean', description: 'Whether the click was verified' },
        verificationMethod: { type: 'string' },
      },
    },
    riskLevel: 'high',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('mouse_click');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      // This tool SHOULD trigger a verification loop after execution.
      // The agent loop checks the output's `verified` field.
      return {
        success: false,
        output: {
          clicked: false,
          verified: false,
          verificationMethod: 'screenshot_diff',
          available: false,
        },
        error: 'ENVIRONMENT_UNAVAILABLE: No display server',
        durationMs: 0,
      };
    },
  };
}

export function createMouseScrollTool(): ToolHandler {
  return {
    name: 'mouse_scroll',
    description: 'Scroll the mouse wheel.',
    inputSchema: {
      type: 'object',
      properties: {
        deltaX: { type: 'number', description: 'Horizontal scroll amount' },
        deltaY: { type: 'number', description: 'Vertical scroll amount (positive = down)' },
      },
    },
    outputSchema: { type: 'object', properties: { deltaX: { type: 'number' }, deltaY: { type: 'number' } } },
    riskLevel: 'low',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('mouse_scroll');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      return {
        success: false,
        output: { deltaX: input.deltaX || 0, deltaY: input.deltaY || 0, available: false },
        error: 'ENVIRONMENT_UNAVAILABLE: No display server',
        durationMs: 0,
      };
    },
  };
}
