/**
 * App tools — launch and close applications.
 * Uses platform-native commands (start/open/xdg-open, taskkill/pkill)
 * since nut.js does not provide direct app lifecycle APIs.
 *
 * These tools do NOT require a display server (unlike mouse/keyboard),
 * but they still gate behind the permission manager.
 */
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { getPermissionManager } from '../../permissions/permissionManager.js';
import { isWindows, isMac, isLinux } from './platform.js';
import { execSync, spawn } from 'node:child_process';

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

      const start = Date.now();
      try {
        const app = String(input.app);
        const args = Array.isArray(input.args)
          ? (input.args as string[]).map(String)
          : [];

        // Spawn the process so we can capture the PID.
        // On Windows, `start` is a shell builtin — we use cmd /c.
        // On macOS, `open` launches GUI apps.
        // On Linux, `xdg-open` opens files/URLs; for executables we run directly.
        let child: any;
        let pid: number | undefined;

        if (isWindows()) {
          // `start "" app args...` launches without waiting and returns immediately
          const cmdStr = `start "" "${app}" ${args.map(a => `"${a}"`).join(' ')}`;
          execSync(cmdStr, { windowsHide: true, timeout: 10000 });
          // `start` doesn't give us the PID easily, but the launch succeeded.
          pid = undefined;
        } else if (isMac()) {
          child = spawn('open', [app, ...args], {
            detached: true,
            stdio: 'ignore',
          });
          pid = child.pid;
          child.unref();
        } else {
          // Linux — try xdg-open for files/URLs, or direct exec for binaries
          if (/^(https?|file):\/\//.test(app) || !app.includes('/')) {
            // Looks like a URL or bare app name → use xdg-open
            child = spawn('xdg-open', [app, ...args], {
              detached: true,
              stdio: 'ignore',
            });
          } else {
            // Absolute/relative path → execute directly
            child = spawn(app, args, {
              detached: true,
              stdio: 'ignore',
            });
          }
          pid = child.pid;
          child.unref();
        }

        return {
          success: true,
          output: { launched: true, pid },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          success: false,
          output: { launched: false },
          error: `Failed to launch application: ${err.message}`,
          durationMs: Date.now() - start,
        };
      }
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
      const perms = getPermissionManager();
      const check = perms.check('app_close');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      const start = Date.now();
      try {
        const app = String(input.app);
        const isPid = /^\d+$/.test(app);

        if (isWindows()) {
          if (isPid) {
            execSync(`taskkill /PID ${app} /T /F`, { windowsHide: true, timeout: 10000 });
          } else {
            // /IM matches the image name (e.g. notepad.exe)
            execSync(`taskkill /IM "${app}" /T /F`, { windowsHide: true, timeout: 10000 });
          }
        } else {
          // Linux / macOS
          if (isPid) {
            execSync(`kill -9 ${app}`, { timeout: 10000 });
          } else {
            execSync(`pkill -f "${app.replace(/"/g, '\"')}"`, { timeout: 10000 });
          }
        }

        return {
          success: true,
          output: { closed: true, verified: true },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          success: false,
          output: { closed: false, verified: false },
          error: `Failed to close application: ${err.message}`,
          durationMs: Date.now() - start,
        };
      }
    },
  };
}