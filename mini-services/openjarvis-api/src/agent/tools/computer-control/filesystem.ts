/**
 * Filesystem tools — read, write, delete.
 * Read/write are permission-gated.
 * Delete is HARD-BLOCKED — returns requires_approval and halts.
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { getPermissionManager } from '../../permissions/permissionManager.js';
import { getHardBlockedCapabilities } from '../../permissions/types.js';

function safePath(basePath: string, targetPath: string): string {
  const resolved = resolve(basePath, targetPath);
  return resolved;
}

export function createFilesystemReadTool(): ToolHandler {
  return {
    name: 'filesystem_read',
    description: 'Read a file or list a directory. Returns file contents or directory listing.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory path to read' },
        encoding: { type: 'string', description: 'File encoding (default: utf-8)' },
      },
      required: ['path'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['file', 'directory', 'not_found'] },
        content: { type: 'string' },
        entries: { type: 'array', items: { type: 'string' } },
      },
    },
    riskLevel: 'low',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('filesystem_read');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      const targetPath = String(input.path);

      try {
        if (!existsSync(targetPath)) {
          return { success: true, output: { type: 'not_found', path: targetPath }, durationMs: 0 };
        }

        const stat = statSync(targetPath);
        if (stat.isDirectory()) {
          const entries = readdirSync(targetPath);
          return { success: true, output: { type: 'directory', path: targetPath, entries }, durationMs: 0 };
        }

        const content = readFileSync(targetPath, { encoding: (input.encoding || 'utf-8') as BufferEncoding });
        // Truncate very large files to avoid blowing up the context
        const maxLen = 50000;
        const truncated = content.length > maxLen;
        return {
          success: true,
          output: {
            type: 'file',
            path: targetPath,
            content: truncated ? content.slice(0, maxLen) + '\n... [truncated]' : content,
            size: stat.size,
            truncated,
          },
          durationMs: 0,
        };
      } catch (err: any) {
        return { success: false, output: null, error: `Read failed: ${err.message}`, durationMs: 0 };
      }
    },
  };
}

export function createFilesystemWriteTool(): ToolHandler {
  return {
    name: 'filesystem_write',
    description: 'Write content to a file. Creates parent directories if needed.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' },
        append: { type: 'boolean', description: 'Append instead of overwrite (default: false)' },
      },
      required: ['path', 'content'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        written: { type: 'boolean' }, path: { type: 'string' }, bytes: { type: 'number' },
      },
    },
    riskLevel: 'medium',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('filesystem_write');
      if (!check.allowed) return { success: false, output: null, error: check.reason, durationMs: 0 };

      const targetPath = String(input.path);
      const content = String(input.content);

      try {
        // Create parent directories
        const dir = dirname(targetPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        if (input.append) {
          const existing = existsSync(targetPath) ? readFileSync(targetPath, 'utf-8') : '';
          writeFileSync(targetPath, existing + content, 'utf-8');
        } else {
          writeFileSync(targetPath, content, 'utf-8');
        }

        return {
          success: true,
          output: { written: true, path: targetPath, bytes: Buffer.byteLength(content, 'utf-8') },
          durationMs: 0,
        };
      } catch (err: any) {
        return { success: false, output: null, error: `Write failed: ${err.message}`, durationMs: 0 };
      }
    },
  };
}

export function createFilesystemDeleteTool(): ToolHandler {
  return {
    name: 'filesystem_delete',
    description: 'Delete a file or directory. HARD-BLOCKED: requires approval (Phase 9). Returns requires_approval and halts.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory path to delete' },
        recursive: { type: 'boolean', description: 'Delete directories recursively (default: false)' },
      },
      required: ['path'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        deleted: { type: 'boolean' }, requiresApproval: { type: 'boolean' },
      },
    },
    riskLevel: 'critical',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      // HARD-BLOCKED: this capability is in HARD_BLOCKED_CAPABILITIES
      // The permission manager returns requires_approval
      const perms = getPermissionManager();
      const check = perms.check('filesystem_delete');
      if (!check.allowed) {
        return {
          success: false,
          output: { deleted: false, requiresApproval: true },
          error: check.reason, // "requires_approval"
          durationMs: 0,
        };
      }

      // If somehow granted (shouldn't happen), still refuse until Phase 9 approval queue exists
      return {
        success: false,
        output: { deleted: false, requiresApproval: true },
        error: 'requires_approval: Filesystem delete requires human approval via the approval queue (Phase 9)',
        durationMs: 0,
      };
    },
  };
}
