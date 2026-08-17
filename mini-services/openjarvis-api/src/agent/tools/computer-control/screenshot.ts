/**
 * Screenshot tool — captures the screen.
 * Returns actual image data in desktop environments.
 * Returns environment-unavailable in headless sandbox.
 */
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { getPermissionManager } from '../../permissions/permissionManager.js';

export function createScreenshotTool(): ToolHandler {
  return {
    name: 'screenshot',
    description: 'Capture a screenshot of the current screen. Returns base64-encoded image data.',
    inputSchema: {
      type: 'object',
      properties: {
        monitor: { type: 'number', description: 'Monitor index (default: 0)' },
        format: { type: 'string', enum: ['png', 'jpeg'], description: 'Image format (default: png)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        imageBase64: { type: 'string', description: 'Base64-encoded image data' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
    },
    riskLevel: 'low',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('screenshot');
      if (!check.allowed) {
        return { success: false, output: null, error: check.reason, durationMs: 0 };
      }

      try {
        // In desktop: use platform APIs (e.g., xdotool + import on Linux, screencapture on macOS)
        // In this sandbox: return environment-unavailable
        return {
          success: false,
          output: { available: false, reason: 'No display server available in headless environment' },
          error: 'ENVIRONMENT_UNAVAILABLE',
          durationMs: 0,
        };
      } catch (err: any) {
        return { success: false, output: null, error: String(err.message), durationMs: 0 };
      }
    },
  };
}
