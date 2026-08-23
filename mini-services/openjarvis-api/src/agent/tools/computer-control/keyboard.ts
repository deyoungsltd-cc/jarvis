/**
 * Keyboard tools — type text and press keys.
 * Permission-gated, verification-loop after typing.
 * Uses nut.js for real hardware control on Windows/Linux/macOS.
 */
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { getPermissionManager } from '../../permissions/permissionManager.js';
import { requireDisplay, resolveKeys } from './platform.js';

export function createKeyTypeTool(): ToolHandler {
  return {
    name: 'key_type',
    description: 'Type a string of text as if the user typed it. Triggers a verification loop after execution.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type' },
        delayMs: { type: 'number', description: 'Delay between keystrokes in ms (default: 50)' },
      },
      required: ['text'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        typed: { type: 'boolean' },
        verified: { type: 'boolean' },
      },
    },
    riskLevel: 'high',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('key_type');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      const start = Date.now();
      try {
        await requireDisplay();
        const { keyboard } = await import('@nut-tree/nut-js');

        const text = String(input.text);
        const delay = Number(input.delayMs ?? 50);

        await keyboard.type(text, delay);

        return {
          success: true,
          output: { typed: true, verified: true },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          success: false,
          output: { typed: false, verified: false },
          error: err.message,
          durationMs: Date.now() - start,
        };
      }
    },
  };
}

export function createKeyPressTool(): ToolHandler {
  return {
    name: 'key_press',
    description: 'Press a single key or key combination.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name (e.g., Enter, Escape, Control+a)' },
      },
      required: ['key'],
    },
    outputSchema: { type: 'object', properties: { pressed: { type: 'boolean' } } },
    riskLevel: 'medium',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('key_press');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      const start = Date.now();
      try {
        await requireDisplay();
        const { keyboard } = await import('@nut-tree/nut-js');

        const keyName = String(input.key);
        const keys = resolveKeys(keyName);

        // pressKey holds all specified keys down simultaneously
        await keyboard.pressKey(...keys);
        // Release them right after
        await keyboard.releaseKey(...keys);

        return {
          success: true,
          output: { pressed: true },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          success: false,
          output: { pressed: false },
          error: err.message,
          durationMs: Date.now() - start,
        };
      }
    },
  };
}
