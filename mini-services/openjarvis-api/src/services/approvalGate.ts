/**
 * Approval Gate — Phase 10
 *
 * Called by the agent loop before executing a tool.
 * Determines if a tool call requires approval:
 *  1. Check auto-approval rules first (high priority rules first)
 *  2. If no rule matches or rule says require_manual, check risk level
 *  3. hard-blocked capabilities always require manual approval (unless auto-approved by rule)
 *  4. high/critical risk tools require approval unless auto-approved
 *  5. low/medium risk tools with granted capabilities proceed normally
 *
 * Returns:
 *  - { proceed: true } — tool can execute
 *  - { proceed: false, approvalId: string, status: 'waiting_approval' } — mission must pause
 *  - { proceed: false, status: 'blocked', reason: string } — tool is blocked (auto-rejected)
 */
import { approvalService } from './approvalService.js';
import { getHardBlockedCapabilities } from '../agent/permissions/types.js';
import { logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';

export interface ApprovalGateResult {
  proceed: boolean;
  approvalId?: string;
  status?: string;
  reason?: string;
}

export interface ApprovalGateInput {
  toolName: string;
  riskLevel: string;
  capability?: string;
  toolInput: Record<string, unknown>;
  missionId: string;
  requestId: string;
}

export async function checkApprovalGate(input: ApprovalGateInput): Promise<ApprovalGateResult> {
  const { toolName, riskLevel, capability, toolInput, missionId, requestId } = input;

  // Step 1: Check auto-approval rules
  const autoResult = await approvalService.checkAutoApproval(
    toolName,
    riskLevel,
    capability,
    requestId,
  );

  if (autoResult.autoApproved) {
    logger.info(requestId, `Approval gate: tool '${toolName}' auto-approved by rule '${autoResult.matchedRule}'`);
    return { proceed: true };
  }

  if (autoResult.autoRejected) {
    logger.warn(requestId, `Approval gate: tool '${toolName}' auto-rejected by rule '${autoResult.matchedRule}'`);
    return { proceed: false, status: 'blocked', reason: autoResult.reason };
  }

  // Step 2: Determine if manual approval is required
  const needsApproval =
    // Hard-blocked capabilities always need approval
    (capability && getHardBlockedCapabilities().has(capability)) ||
    // High and critical risk tools need approval
    riskLevel === 'high' || riskLevel === 'critical';

  if (!needsApproval) {
    return { proceed: true };
  }

  // Step 3: Create approval request and pause mission
  const reason = capability
    ? `Tool '${toolName}' requires capability '${capability}' which needs approval`
    : `Tool '${toolName}' has risk level '${riskLevel}' which requires manual approval`;

  try {
    const approval = await approvalService.create({
      missionId,
      toolName,
      capability,
      riskLevel,
      reason,
      toolInput,
    }, requestId);

    logger.info(requestId, `Approval gate: created request ${approval.id} for tool '${toolName}'`);

    return {
      proceed: false,
      approvalId: approval.id,
      status: 'waiting_approval',
      reason,
    };
  } catch (err: any) {
    logger.error(requestId, `Approval gate: failed to create approval request: ${err.message}`);
    return {
      proceed: false,
      status: 'failed',
      reason: `Failed to create approval request: ${err.message}`,
    };
  }
}

/**
 * Wait for an approval decision on a specific request.
 * Polls the DB until the request is resolved or times out.
 * Returns the final status.
 */
export async function waitForApprovalDecision(
  approvalId: string,
  requestId: string,
  pollIntervalMs: number = 2000,
  timeoutMs: number = 300000, // 5 min max wait
): Promise<'approved' | 'rejected' | 'expired' | 'cancelled'> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const request = await approvalService.getById(approvalId, requestId);
      if (request.status !== 'pending') {
        return request.status as 'approved' | 'rejected' | 'expired' | 'cancelled';
      }
    } catch {
      // Approval may have been deleted — treat as cancelled
      return 'cancelled';
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout — expire the request
  try {
    await approvalService.cancel(approvalId, requestId);
  } catch {
    // best effort
  }
  return 'expired';
}
