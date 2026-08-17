/**
 * Verification loop (Section 8.3)
 * Every action that changes UI state (click, type) is followed by
 * a real state check before the agent proceeds.
 * Never "assume the click worked."
 */
import { logger } from '../utils/logger.js';

export interface VerificationResult {
  verified: boolean;
  method: 'screenshot_diff' | 'dom_read' | 'explicit_confirmation' | 'output_check';
  evidence?: string;
  error?: string;
}

export type VerificationMethod = 'screenshot_diff' | 'dom_read' | 'explicit_confirmation' | 'output_check' | 'skip';

/**
 * Run verification after a tool that changes UI state.
 * The method depends on what was changed and what's available.
 */
export async function verifyActionResult(options: {
  action: string;
  method: VerificationMethod;
  expectedState?: string;
  actualOutput?: unknown;
  requestId: string;
  missionId?: string;
}): Promise<VerificationResult> {
  const { action, method, expectedState, actualOutput, requestId, missionId } = options;

  logger.info(requestId, `Verification: ${action} via ${method}`);

  switch (method) {
    case 'screenshot_diff':
      // In a desktop environment, this would capture a screenshot and diff
      // against a baseline or check for expected UI changes
      return {
        verified: false,
        method: 'screenshot_diff',
        error: 'Screenshot verification not available in headless environment',
      };

    case 'dom_read':
      // In a desktop environment with accessibility tree access, this would
      // read the DOM/accessibility tree to confirm the expected state
      return {
        verified: false,
        method: 'dom_read',
        error: 'DOM verification not available in headless environment',
      };

    case 'explicit_confirmation':
      // Used when no automated verification is possible — the action
      // returns output that the agent can inspect
      if (actualOutput !== undefined && actualOutput !== null) {
        return {
          verified: true,
          method: 'explicit_confirmation',
          evidence: typeof actualOutput === 'string' ? actualOutput : JSON.stringify(actualOutput),
        };
      }
      return {
        verified: false,
        method: 'explicit_confirmation',
        error: 'No output returned from action',
      };

    case 'output_check':
      // Check if the tool output contains the expected state
      if (expectedState && actualOutput) {
        const outputStr = typeof actualOutput === 'string'
          ? actualOutput
          : JSON.stringify(actualOutput);
        const verified = outputStr.includes(expectedState);
        return {
          verified,
          method: 'output_check',
          evidence: verified ? `Found "${expectedState}" in output` : `Expected "${expectedState}" not found in output`,
        };
      }
      return {
        verified: false,
        method: 'output_check',
        error: 'No expected state or output to compare',
      };

    case 'skip':
      return { verified: true, method: 'skip' };

    default:
      return {
        verified: false,
        method: 'output_check',
        error: `Unknown verification method: ${method}`,
      };
  }
}

/**
 * Determine the appropriate verification method for a tool.
 */
export function getVerificationMethod(toolName: string): VerificationMethod {
  const uiChangingTools = ['mouse_click', 'key_type', 'key_press', 'window_focus', 'app_launch', 'app_close'];
  if (uiChangingTools.includes(toolName)) {
    // Prefer screenshot_diff in desktop, fall back to explicit_confirmation
    return 'screenshot_diff';
  }
  return 'skip';
}
