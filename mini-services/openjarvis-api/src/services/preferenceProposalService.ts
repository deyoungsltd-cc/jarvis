/**
 * Phase 14 — Preference Proposal Service
 *
 * Tracks how many times a capability is approved and proposes
 * "always allow" when a threshold is reached.
 * The admin must explicitly accept — never inferred and applied silently.
 */
import { db } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';
import { capabilityRegistry } from './capabilityRegistry.js';

const APPROVAL_THRESHOLD = 3; // propose after 3 manual approvals

export const preferenceProposalService = {
  /**
   * Record that a capability was manually approved.
   * If it hits the threshold, create a preference proposal.
   */
  async recordApproval(capability: string, requestId: string = '-') {
    // Count recent approvals for this capability
    const recentApprovals = await db.approvalRequest.count({
      where: {
        capability,
        status: 'approved',
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // last 30 days
      },
    });

    // Check if there's already a pending proposal
    const existingProposal = await db.preferenceProposal.findFirst({
      where: { capability, status: 'pending' },
    });

    if (recentApprovals >= APPROVAL_THRESHOLD && !existingProposal) {
      const proposal = await db.preferenceProposal.create({
        data: {
          capability,
          proposalType: 'always_allow',
          timesApproved: recentApprovals,
          context: JSON.stringify({
            reason: `Capability '${capability}' has been manually approved ${recentApprovals} times in the last 30 days.`,
            threshold: APPROVAL_THRESHOLD,
          }),
        },
      });

      logger.info(requestId, `Preference proposal created: always_allow '${capability}' (after ${recentApprovals} approvals)`);
      eventBus.emit('preference:proposal', { proposalId: proposal.id, capability, proposalType: 'always_allow' });

      return proposal;
    }

    return null;
  },

  /** Accept a preference proposal — creates a permanent capability grant */
  async acceptProposal(proposalId: string, requestId: string = '-') {
    const proposal = await db.preferenceProposal.findUnique({ where: { id: proposalId } });
    if (!proposal || proposal.status !== 'pending') {
      throw new Error('Proposal not found or not pending');
    }

    // Create the permanent grant
    await capabilityRegistry.grant({
      capability: proposal.capability,
      allowed: proposal.proposalType === 'always_allow',
      scopeType: 'permanent',
      source: 'approval_always_allow',
      approvalRequestId: proposalId,
    }, requestId);

    // Mark proposal as accepted
    await db.preferenceProposal.update({
      where: { id: proposalId },
      data: { status: 'accepted', resolvedAt: new Date() },
    });

    logger.info(requestId, `Preference proposal accepted: ${proposal.proposalType} '${proposal.capability}'`);
    return { accepted: true, capability: proposal.capability };
  },

  /** Dismiss a preference proposal */
  async dismissProposal(proposalId: string) {
    const proposal = await db.preferenceProposal.update({
      where: { id: proposalId },
      data: { status: 'dismissed', resolvedAt: new Date() },
    });
    return proposal;
  },

  /** List all proposals */
  async listProposals(filters?: { status?: string; capability?: string }) {
    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.capability) where.capability = filters.capability;

    return db.preferenceProposal.findMany({
      where, orderBy: { createdAt: 'desc' },
    });
  },
};
