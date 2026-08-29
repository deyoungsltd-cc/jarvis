/**
 * Approval Gate — Phase 10 Authorization Model
 *
 * Implements the authorization flow from the spec:
 *   1. Check auto-approval rules first (highest priority — admin-configured policy overrides)
 *   2. If no rule matches, check the capability registry:
 *      - ALLOWED → execute immediately
 *      - DENIED → block (no retry, no workaround)
 *      - UNDEFINED → pause and ask the admin
 *   3. For tools without a capability (e.g. web_search, memory tools),
 *      fall back to risk-level-based gating:
 *      - low/medium → proceed
 *      - high/critical → pause and ask
 *
 * Returns:
 *  - { proceed: true } — tool can execute
 *  - { proceed: false, approvalId, status: 'waiting_approval' } — mission must pause
 *  - { proceed: false, status: 'blocked', reason } — tool is blocked (denied or auto-rejected)
 */
import { approvalService } from '@/lib/api/approvalService.js';
import { capabilityRegistry } from '@/lib/api/capabilityRegistry.js';
import { logger } from '@/lib/api/logger';

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

  // Step 1: Check auto-approval rules (admin-configured policy)
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

  // Step 2: If this tool has a capability, check the capability registry
  if (capability) {
    const capResult = await capabilityRegistry.check(capability, {
      missionId,
      toolInput,
    }, requestId);

    if (capResult.status === 'allowed') {
      logger.info(requestId, `Approval gate: capability '${capability}' is ALLOWED by grant ${capResult.grantId}`);
      return { proceed: true };
    }

    if (capResult.status === 'denied') {
      logger.warn(requestId, `Approval gate: capability '${capability}' is DENIED by grant ${capResult.grantId}`);
      return {
        proceed: false,
        status: 'blocked',
        reason: `Capability '${capability}' has been explicitly denied by admin. ${capResult.reason}`,
      };
    }

    // UNDEFINED — fall through to create approval request (pause and ask)
    logger.info(requestId, `Approval gate: capability '${capability}' is UNDEFINED. Pausing to ask admin.`);
  }

  // Step 3: No auto-rule matched and capability is undefined (or no capability).
  // Use risk-level-based fallback for tools without capabilities.
  // For tools WITH capabilities that are undefined, always pause (never auto-proceed).
  const needsManualApproval = capability
    ? true // undefined capability → always ask
    : (riskLevel === 'high' || riskLevel === 'critical'); // no capability → risk-based fallback

  if (!needsManualApproval) {
    return { proceed: true };
  }

  // Step 4: Create approval request and pause mission
  const reason = capability
    ? `Tool '${toolName}' requires capability '${capability}' which is not yet granted. Admin decision needed.`
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
