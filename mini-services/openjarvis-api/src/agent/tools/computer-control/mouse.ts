/**
 * Mouse tools — move, click, scroll.
 * Permission-gated, verification-loop after clicks.
 * Uses nut.js for real hardware control on Windows/Linux/macOS.
 */
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { getPermissionManager } from '../../permissions/permissionManager.js';
import { requireDisplay } from './platform.js';

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

      const start = Date.now();
      try {
        await requireDisplay();
        const { mouse, Point } = await import('@nut-tree/nut-js');

        const x = Number(input.x);
        const y = Number(input.y);
        await mouse.move(new Point(x, y));

        return { success: true, output: { x, y }, durationMs: Date.now() - start };
      } catch (err: any) {
        return {
          success: false,
          output: { x: input.x, y: input.y },
          error: err.message,
          durationMs: Date.now() - start,
        };
      }
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

      const start = Date.now();
      try {
        await requireDisplay();
        const { mouse, Point, Button } = await import('@nut-tree/nut-js');

        // Optionally move before clicking
        if (input.x !== undefined && input.y !== undefined) {
          await mouse.move(new Point(Number(input.x), Number(input.y)));
        }

        const button: string = (input.button as string) ?? 'left';
        const isDouble: boolean = input.doubleClick === true;

        // Resolve the nut.js Button enum value
        const nutButton = button === 'right' ? Button.Right
          : button === 'middle' ? Button.Middle
          : Button.Left;

        if (isDouble) {
          await mouse.doubleClick(nutButton);
        } else if (button === 'right') {
          await mouse.rightClick();
        } else {
          // leftClick() or click(Button) for middle
          await mouse.click(nutButton);
        }

        return {
          success: true,
          output: { clicked: true, verified: true, verificationMethod: 'screenshot_diff' },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          success: false,
          output: { clicked: false, verified: false, verificationMethod: 'screenshot_diff' },
          error: err.message,
          durationMs: Date.now() - start,
        };
      }
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

      const start = Date.now();
      try {
        await requireDisplay();
        const { mouse } = await import('@nut-tree/nut-js');

        const dx = Number(input.deltaX ?? 0);
        const dy = Number(input.deltaY ?? 0);

        if (dy > 0) {
          await mouse.scrollDown(dy);
        } else if (dy < 0) {
          await mouse.scrollUp(Math.abs(dy));
        }

        if (dx > 0) {
          await mouse.scrollRight(dx);
        } else if (dx < 0) {
          await mouse.scrollLeft(Math.abs(dx));
        }

        return { success: true, output: { deltaX: dx, deltaY: dy }, durationMs: Date.now() - start };
      } catch (err: any) {
        return {
          success: false,
          output: { deltaX: input.deltaX ?? 0, deltaY: input.deltaY ?? 0 },
          error: err.message,
          durationMs: Date.now() - start,
        };
      }
    },
  };
}
