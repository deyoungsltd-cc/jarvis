/**
 * Phase 9 — Approval Service
 * Manages the approval request lifecycle: create, approve, reject, cancel, expire.
 * Includes expiration cleanup and trust-based auto-approve counting.
 */
import { db } from '../utils/db.js';
import { notFound, badRequest } from '../utils/errors.js';
import {
  ApprovalRequestInput,
  ApprovalStatus,
  VALID_APPROVAL_TRANSITIONS,
  APPROVAL_STATUSES,
} from './types.js';
import { emitApprovalEvent } from '../utils/eventBus.js';

function validateApprovalTransition(current: string, target: ApprovalStatus): void {
  if (!APPROVAL_STATUSES.includes(current as ApprovalStatus)) {
    throw new Error(`Invalid current approval status: '${current}'`);
  }
  const allowed = VALID_APPROVAL_TRANSITIONS[current as ApprovalStatus];
  if (!allowed.includes(target)) {
    throw new Error(
      `Invalid approval transition: '${current}' → '${target}'. Allowed: ${allowed.join(', ') || 'none'}`,
    );
  }
}

export const approvalService = {
  /** Create a new approval request */
  async create(input: ApprovalRequestInput, requestId: string) {
    const mission = await db.mission.findUnique({ where: { id: input.missionId } });
    if (!mission) {
      throw notFound('MISSION_NOT_FOUND', `Mission ${input.missionId} not found`, requestId);
    }

    const ttlSeconds = input.ttlSeconds || 300;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const request = await db.approvalRequest.create({
      data: {
        missionId: input.missionId,
        toolName: input.toolName,
        toolInput: input.toolInput ? JSON.stringify(input.toolInput) : null,
        riskLevel: input.riskLevel || 'medium',
        reason: input.reason || null,
        status: 'pending',
        expiresAt,
      },
    });

    emitApprovalEvent(input.missionId, 'created', request);
    return request;
  },

  /** Get an approval request by ID */
  async getById(id: string, requestId: string) {
    const request = await db.approvalRequest.findUnique({ where: { id } });
    if (!request) {
      throw notFound('APPROVAL_NOT_FOUND', `Approval request ${id} not found`, requestId);
    }
    return request;
  },

  /** List approval requests, optionally filtered */
  async list(filters?: { missionId?: string; status?: ApprovalStatus }, requestId: string) {
    const where: Record<string, unknown> = {};
    if (filters?.missionId) where.missionId = filters.missionId;
    if (filters?.status) where.status = filters.status;

    return db.approvalRequest.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'desc' },
    });
  },

  /** List pending approval requests */
  async listPending(requestId: string) {
    return approvalService.list({ status: 'pending' }, requestId);
  },

  /** Approve an approval request */
  async approve(id: string, input?: { resolvedBy?: string }, requestId: string) {
    const request = await approvalService.getById(id, requestId);
    validateApprovalTransition(request.status, 'approved');

    if (request.expiresAt && new Date() > request.expiresAt) {
      await approvalService.expire(id, requestId);
      throw badRequest('APPROVAL_EXPIRED', `Approval request ${id} has expired`, requestId);
    }

    const updated = await db.approvalRequest.update({
      where: { id },
      data: {
        status: 'approved',
        resolvedBy: input?.resolvedBy || 'user',
        resolvedAt: new Date(),
      },
    });

    emitApprovalEvent(updated.missionId, 'approved', updated);
    return updated;
  },

  /** Reject an approval request */
  async reject(id: string, input?: { resolvedBy?: string }, requestId: string) {
    const request = await approvalService.getById(id, requestId);
    validateApprovalTransition(request.status, 'rejected');

    if (request.expiresAt && new Date() > request.expiresAt) {
      await approvalService.expire(id, requestId);
      throw badRequest('APPROVAL_EXPIRED', `Approval request ${id} has expired`, requestId);
    }

    const updated = await db.approvalRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        resolvedBy: input?.resolvedBy || 'user',
        resolvedAt: new Date(),
      },
    });

    emitApprovalEvent(updated.missionId, 'rejected', updated);
    return updated;
  },

  /** Cancel an approval request */
  async cancel(id: string, requestId: string) {
    const request = await approvalService.getById(id, requestId);
    validateApprovalTransition(request.status, 'cancelled');

    const updated = await db.approvalRequest.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    emitApprovalEvent(updated.missionId, 'cancelled', updated);
    return updated;
  },

  /** Mark an approval request as expired */
  async expire(id: string, requestId: string) {
    const request = await approvalService.getById(id, requestId);
    if (request.status !== 'pending') return request;

    const updated = await db.approvalRequest.update({
      where: { id },
      data: {
        status: 'expired',
        resolvedBy: 'system',
        resolvedAt: new Date(),
      },
    });

    emitApprovalEvent(updated.missionId, 'expired', updated);
    return updated;
  },

  /** Expire all pending requests past their TTL */
  async expireOverdue(requestId: string): Promise<number> {
    const now = new Date();
    const expired = await db.approvalRequest.findMany({
      where: { status: 'pending', expiresAt: { lt: now } },
    });
    let count = 0;
    for (const req of expired) {
      await approvalService.expire(req.id, requestId);
      count++;
    }
    return count;
  },

  /** Cancel all pending requests for a mission */
  async cancelAllForMission(missionId: string, requestId: string): Promise<number> {
    const pending = await db.approvalRequest.findMany({
      where: { missionId, status: 'pending' },
    });
    let count = 0;
    for (const req of pending) {
      await approvalService.cancel(req.id, requestId);
      count++;
    }
    return count;
  },

  /** Count recent approvals for a specific tool within a mission */
  async countRecentApprovals(missionId: string, toolName: string, _limit: number): Promise<number> {
    const approved = await db.approvalRequest.findMany({
      where: { missionId, toolName, status: 'approved' },
    });
    return approved.length;
  },
};
