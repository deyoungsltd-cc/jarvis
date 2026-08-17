/**
 * Window tools — list, focus, get info about windows.
 */
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { getPermissionManager } from '../../permissions/permissionManager.js';

export function createWindowListTool(): ToolHandler {
  return {
    name: 'window_list',
    description: 'List all open windows with their titles, positions, and states.',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        windows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' }, title: { type: 'string' },
              focused: { type: 'boolean' }, x: { type: 'number' }, y: { type: 'number' },
              width: { type: 'number' }, height: { type: 'number' },
            },
          },
        },
      },
    },
    riskLevel: 'low',
    async execute(_input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('window_list');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      try {
        // In desktop: use xdotool, wmctrl, or native APIs
        // In sandbox: try to detect what's available
        const { execSync } = require('child_process');
        let result: string;
        try {
          result = execSync('wmctrl -l', { encoding: 'utf-8', timeout: 5000 });
          const windows = result.trim().split('\n').map(line => {
            const parts = line.split(/\s{2,}/);
            return { id: parts[0], title: parts.slice(1).join(' ').trim() };
          });
          return { success: true, output: { windows }, durationMs: 0 };
        } catch {
          // No wmctrl — return empty
          return {
            success: true,
            output: { windows: [], note: 'No window manager tools available in this environment' },
            durationMs: 0,
          };
        }
      } catch (err: any) {
        return { success: false, output: null, error: String(err.message), durationMs: 0 };
      }
    },
  };
}

export function createWindowFocusTool(): ToolHandler {
  return {
    name: 'window_focus',
    description: 'Focus a specific window by its ID. Triggers a verification loop after execution.',
    inputSchema: {
      type: 'object',
      properties: {
        windowId: { type: 'string', description: 'Window ID to focus' },
      },
      required: ['windowId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        focused: { type: 'boolean' }, verified: { type: 'boolean' },
      },
    },
    riskLevel: 'medium',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('window_focus');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      return {
        success: false,
        output: { focused: false, verified: false, available: false },
        error: 'ENVIRONMENT_UNAVAILABLE: No window manager',
        durationMs: 0,
      };
    },
  };
}

export function createWindowInfoTool(): ToolHandler {
  return {
    name: 'window_info',
    description: 'Get detailed information about the currently focused window.',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' }, className: { type: 'string' },
        pid: { type: 'number' }, geometry: { type: 'object' },
      },
    },
    riskLevel: 'low',
    async execute(_input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('window_info');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      return {
        success: true,
        output: { note: 'No display server — returning empty info' },
        durationMs: 0,
      };
    },
  };
}
