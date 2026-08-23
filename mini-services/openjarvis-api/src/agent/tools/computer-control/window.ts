/**
 * Window tools — list, focus, get info about windows.
 * Uses nut.js window module for real hardware control.
 */
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { getPermissionManager } from '../../permissions/permissionManager.js';
import { requireDisplay } from './platform.js';

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

      const start = Date.now();
      try {
        await requireDisplay();
        const { window } = await import('@nut-tree/nut-js');

        // Fetch the currently focused window first so we can mark it
        let activeTitle: string | undefined;
        try {
          const active = await window.getActiveWindow();
          activeTitle = active?.title;
        } catch {
          // Not all platforms support getActiveWindow
        }

        // List all windows — nut.js filterWindows returns WindowHandle[]
        // which exposes title, processId, bounds, etc.
        const windows = await window.filterWindows(() => true);

        const result = windows.map((w: any, idx: number) => {
          const bounds = w.bounds ?? w.region;
          return {
            id: w.processId ?? idx,
            title: w.title ?? '',
            focused: activeTitle ? w.title === activeTitle : false,
            x: bounds?.x ?? 0,
            y: bounds?.y ?? 0,
            width: bounds?.width ?? 0,
            height: bounds?.height ?? 0,
          };
        });

        return { success: true, output: { windows: result }, durationMs: Date.now() - start };
      } catch (err: any) {
        return {
          success: false,
          output: null,
          error: err.message,
          durationMs: Date.now() - start,
        };
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

      const start = Date.now();
      try {
        await requireDisplay();
        const { window } = await import('@nut-tree/nut-js');

        const windowId = String(input.windowId);

        // Try to find the window handle by PID or title
        const allWindows = await window.filterWindows(() => true);
        const match = allWindows.find((w: any) =>
          String(w.processId) === windowId || w.title?.includes(windowId),
        );

        if (!match) {
          return {
            success: false,
            output: { focused: false, verified: false },
            error: `Window not found matching ID/title: "${windowId}"`,
            durationMs: Date.now() - start,
          };
        }

        await window.focusWindow(match);

        return {
          success: true,
          output: { focused: true, verified: true },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          success: false,
          output: { focused: false, verified: false },
          error: err.message,
          durationMs: Date.now() - start,
        };
      }
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

      const start = Date.now();
      try {
        await requireDisplay();
        const { window } = await import('@nut-tree/nut-js');

        const active = await window.getActiveWindow();
        const bounds = active?.bounds ?? active?.region;

        return {
          success: true,
          output: {
            title: active?.title ?? '',
            className: active?.owner?.name ?? '',
            pid: active?.processId ?? 0,
            geometry: bounds
              ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
              : null,
          },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          success: false,
          output: null,
          error: err.message,
          durationMs: Date.now() - start,
        };
      }
    },
  };
}
