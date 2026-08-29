/**
 * Phase 9 — Approval Policy Engine
 * Determines whether a tool call needs human approval based on risk level,
 * tool history, and configurable policy rules.
 */
import { ToolCheckResult, RiskLevel, ApprovalPolicy, DEFAULT_APPROVAL_POLICY } from './types.js';
import { approvalService } from './approvalService.js';

export class ApprovalPolicyEngine {
  private policy: ApprovalPolicy;

  constructor(policy?: Partial<ApprovalPolicy>) {
    this.policy = { ...DEFAULT_APPROVAL_POLICY, ...policy };
  }

  /** Get the current policy */
  getPolicy(): ApprovalPolicy {
    return { ...this.policy };
  }

  /** Update policy settings */
  updatePolicy(updates: Partial<ApprovalPolicy>): ApprovalPolicy {
    this.policy = { ...this.policy, ...updates };
    return this.getPolicy();
  }

  /**
   * Check whether a tool call is allowed under the current policy.
   * Returns a ToolCheckResult indicating the decision.
   *
   * Logic:
   * 1. Hard-blocked risk levels → always require approval (creates request)
   * 2. Auto-approve risk levels → allowed immediately
   * 3. Require-approval risk levels → check trust history, then create request if needed
   */
  async checkToolExecution(params: {
    missionId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    riskLevel: RiskLevel;
    requestId: string;
  }): Promise<ToolCheckResult> {
    const { missionId, toolName, toolInput, riskLevel, requestId } = params;

    // 1. Hard-blocked: always requires explicit human approval
    if (this.policy.hardBlockRiskLevels.includes(riskLevel)) {
      const request = await approvalService.create({
        missionId,
        toolName,
        toolInput,
        riskLevel,
        reason: `Tool '${toolName}' has critical risk level and requires explicit human approval`,
      }, requestId);
      return {
        allowed: false,
        reason: 'requires_approval',
        approvalRequestId: request.id,
      };
    }

    // 2. Auto-approve: allowed immediately
    if (this.policy.autoApproveRiskLevels.includes(riskLevel)) {
      return { allowed: true };
    }

    // 3. Require-approval risk levels: check trust history
    if (this.policy.requireApprovalRiskLevels.includes(riskLevel)) {
      // Check if the tool has been used successfully enough times to earn trust
      if (this.policy.trustRepeatedToolUse) {
        const recentApprovals = await approvalService.countRecentApprovals(
          missionId, toolName, this.policy.trustRepeatLimit,
        );
        if (recentApprovals >= this.policy.trustRepeatLimit) {
          // Trust threshold reached: auto-approve this time
          return { allowed: true };
        }
      }

      // No trust: create approval request
      const riskLabels: Record<RiskLevel, string> = {
        low: 'low',
        medium: 'medium',
        high: 'high',
        critical: 'critical',
      };
      const request = await approvalService.create({
        missionId,
        toolName,
        toolInput,
        riskLevel,
        reason: `Tool '${toolName}' has ${riskLabels[riskLevel]} risk level and requires approval`,
      }, requestId);
      return {
        allowed: false,
        reason: 'requires_approval',
        approvalRequestId: request.id,
      };
    }

    // Unknown risk level: default to requiring approval (safe default)
    const request = await approvalService.create({
      missionId,
      toolName,
      toolInput,
      riskLevel,
      reason: `Tool '${toolName}' has unknown risk level '${riskLevel}' and requires approval`,
    }, requestId);
    return {
      allowed: false,
      reason: 'requires_approval',
      approvalRequestId: request.id,
    };
  }
}

// Singleton
let instance: ApprovalPolicyEngine | null = null;

export function getApprovalPolicyEngine(): ApprovalPolicyEngine {
  if (!instance) {
    instance = new ApprovalPolicyEngine();
  }
  return instance;
}
