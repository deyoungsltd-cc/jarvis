/**
 * Clipboard tools — read and write the system clipboard.
 * Uses nut.js clipboard module.
 *
 * NOTE: On some Linux setups nut.js clipboard requires xclip / xsel.
 * Falls back to a native-platform command if nut.js clipboard is unavailable
 * but a display *is* available (e.g. xclip on Linux, pbpaste on macOS).
 */
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { getPermissionManager } from '../../permissions/permissionManager.js';
import { requireDisplay, isMac, isLinux, isWindows } from '@/lib/api/platform.js';
import { execSync } from 'node:child_process';

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

      const start = Date.now();
      try {
        await requireDisplay();
        const { clipboard } = await import('@nut-tree/nut-js');

        let content: string;
        try {
          content = await clipboard.paste();
        } catch {
          // nut.js clipboard can fail on certain Linux configs; fall back
          content = nativeClipboardRead();
        }

        return {
          success: true,
          output: { content },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          success: false,
          output: { content: null },
          error: err.message,
          durationMs: Date.now() - start,
        };
      }
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

      const start = Date.now();
      try {
        await requireDisplay();
        const { clipboard } = await import('@nut-tree/nut-js');

        const text = String(input.content);
        try {
          await clipboard.copy(text);
        } catch {
          // nut.js clipboard can fail on certain Linux configs; fall back
          nativeClipboardWrite(text);
        }

        return {
          success: true,
          output: { written: true },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          success: false,
          output: { written: false },
          error: err.message,
          durationMs: Date.now() - start,
        };
      }
    },
  };
}

// ------------------------------------------------------------------
// Platform-native clipboard fallbacks
// ------------------------------------------------------------------

function nativeClipboardRead(): string {
  try {
    if (isMac()) {
      return execSync('pbpaste', { encoding: 'utf-8', timeout: 3000 });
    }
    if (isLinux()) {
      // Try xclip first, then xsel
      try {
        return execSync('xclip -selection clipboard -o', { encoding: 'utf-8', timeout: 3000 });
      } catch {
        return execSync('xsel --clipboard --output', { encoding: 'utf-8', timeout: 3000 });
      }
    }
    if (isWindows()) {
      return execSync(
        'powershell -NoProfile -Command Get-Clipboard',
        { encoding: 'utf-8', timeout: 5000 },
      );
    }
  } catch {
    // swallow — caller will see empty string
  }
  return '';
}

function nativeClipboardWrite(text: string): void {
  if (isMac()) {
    execSync(`pbcopy`, { input: text, encoding: 'utf-8', timeout: 3000 });
    return;
  }
  if (isLinux()) {
    try {
      execSync('xclip -selection clipboard', { input: text, encoding: 'utf-8', timeout: 3000 });
    } catch {
      execSync('xsel --clipboard --input', { input: text, encoding: 'utf-8', timeout: 3000 });
    }
    return;
  }
  if (isWindows()) {
    execSync(
      `powershell -NoProfile -Command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`,
      { encoding: 'utf-8', timeout: 5000 },
    );
    return;
  }
}