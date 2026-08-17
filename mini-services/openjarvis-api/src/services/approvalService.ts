/**
 * Approval Service — Phase 10
 *
 * Manages the approval workflow lifecycle:
 *  - Create approval requests when agent hits a hard-blocked capability or high-risk tool
 *  - Approve / reject / cancel / expire requests
 *  - Rule-based auto-approval engine
 *  - Pending request resolution for agent loop resumption
 */
import { db } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
export type ApprovalAction = 'auto_approve' | 'auto_reject' | 'require_manual';

export interface ApprovalRequestCreate {
  missionId: string;
  toolName: string;
  capability?: string;
  riskLevel: string;
  reason?: string;
  toolInput?: Record<string, unknown>;
  ttlSeconds?: number; // how long before auto-expire (default 300 = 5 min)
}

export interface ApprovalRuleCreate {
  name: string;
  description?: string;
  enabled?: boolean;
  matchRiskLevels?: string[];
  matchToolNames?: string[];
  matchCapabilities?: string[];
  action: ApprovalAction;
  priority?: number;
}

export interface ApprovalRuleUpdate {
  description?: string;
  enabled?: boolean;
  matchRiskLevels?: string[];
  matchToolNames?: string[];
  matchCapabilities?: string[];
  action?: ApprovalAction;
  priority?: number;
}

export const approvalService = {
  // =================================================================
  // Approval Request CRUD
  // =================================================================

  async create(data: ApprovalRequestCreate, requestId: string = '-') {
    const ttlSeconds = data.ttlSeconds || parseInt(process.env.APPROVAL_TTL_SECONDS || '300', 10);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const request = await db.approvalRequest.create({
      data: {
        missionId: data.missionId,
        toolName: data.toolName,
        capability: data.capability || null,
        riskLevel: data.riskLevel,
        status: 'pending',
        reason: data.reason || null,
        toolInput: data.toolInput ? JSON.stringify(data.toolInput) : null,
        expiresAt,
      },
    });

    logger.info(requestId, `Approval request created: ${request.id} for tool '${data.toolName}' (risk: ${data.riskLevel})`);

    // Broadcast via WebSocket
    eventBus.emit('approval:created', { id: request.id, missionId: data.missionId, toolName: data.toolName, riskLevel: data.riskLevel });

    return this._toPublic(request);
  },

  async getById(id: string, requestId: string = '-') {
    const request = await db.approvalRequest.findUnique({ where: { id } });
    if (!request) throw new Error(`Approval request not found: ${id}`);
    return this._toPublic(request);
  },

  async list(filters?: {
    missionId?: string;
    status?: ApprovalStatus;
    riskLevel?: string;
    limit?: number;
    offset?: number;
  }, requestId: string = '-') {
    const where: Record<string, unknown> = {};
    if (filters?.missionId) where.missionId = filters.missionId;
    if (filters?.status) where.status = filters.status;
    if (filters?.riskLevel) where.riskLevel = filters.riskLevel;

    const requests = await db.approvalRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });

    const total = await db.approvalRequest.count({ where });

    return {
      items: requests.map(r => this._toPublic(r)),
      total,
      limit: filters?.limit || 50,
      offset: filters?.offset || 0,
    };
  },

  async getPendingForMission(missionId: string, requestId: string = '-') {
    const requests = await db.approvalRequest.findMany({
      where: { missionId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    return requests.map(r => this._toPublic(r));
  },

  // =================================================================
  // Approve / Reject / Cancel
  // =================================================================

  async approve(id: string, resolvedBy: string = 'user', response?: string, requestId: string = '-') {
    const request = await db.approvalRequest.findUnique({ where: { id } });
    if (!request) throw new Error(`Approval request not found: ${id}`);
    if (request.status !== 'pending') {
      throw new Error(`Cannot approve request in status '${request.status}'`);
    }

    // Check expiry
    if (request.expiresAt && new Date() > request.expiresAt) {
      await db.approvalRequest.update({ where: { id }, data: { status: 'expired' } });
      throw new Error(`Approval request ${id} has expired`);
    }

    const updated = await db.approvalRequest.update({
      where: { id },
      data: {
        status: 'approved',
        resolvedBy,
        resolvedAt: new Date(),
        response: response || null,
      },
    });

    logger.info(requestId, `Approval request ${id} APPROVED by ${resolvedBy}`);
    eventBus.emit('approval:resolved', { id, missionId: request.missionId, status: 'approved', toolName: request.toolName, resolvedBy });

    return this._toPublic(updated);
  },

  async reject(id: string, resolvedBy: string = 'user', response?: string, requestId: string = '-') {
    const request = await db.approvalRequest.findUnique({ where: { id } });
    if (!request) throw new Error(`Approval request not found: ${id}`);
    if (request.status !== 'pending') {
      throw new Error(`Cannot reject request in status '${request.status}'`);
    }

    const updated = await db.approvalRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        resolvedBy,
        resolvedAt: new Date(),
        response: response || null,
      },
    });

    logger.info(requestId, `Approval request ${id} REJECTED by ${resolvedBy}`);
    eventBus.emit('approval:resolved', { id, missionId: request.missionId, status: 'rejected', toolName: request.toolName, resolvedBy });

    return this._toPublic(updated);
  },

  async cancel(id: string, requestId: string = '-') {
    const request = await db.approvalRequest.findUnique({ where: { id } });
    if (!request) throw new Error(`Approval request not found: ${id}`);
    if (request.status !== 'pending') {
      throw new Error(`Cannot cancel request in status '${request.status}'`);
    }

    const updated = await db.approvalRequest.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    logger.info(requestId, `Approval request ${id} CANCELLED`);
    eventBus.emit('approval:resolved', { id, missionId: request.missionId, status: 'cancelled', toolName: request.toolName });

    return this._toPublic(updated);
  },

  // =================================================================
  // Expiry Cleanup
  // =================================================================

  async expirePending(requestId: string = '-') {
    const result = await db.approvalRequest.updateMany({
      where: {
        status: 'pending',
        expiresAt: { lte: new Date() },
      },
      data: { status: 'expired' },
    });

    if (result.count > 0) {
      logger.info(requestId, `Expired ${result.count} pending approval request(s)`);
      // Find and emit events for each expired request
      const expired = await db.approvalRequest.findMany({
        where: { status: 'expired', resolvedAt: null },
      });
      for (const req of expired) {
        await db.approvalRequest.update({
          where: { id: req.id },
          data: { resolvedAt: new Date() },
        });
        eventBus.emit('approval:resolved', { id: req.id, missionId: req.missionId, status: 'expired', toolName: req.toolName });
      }
    }

    return result.count;
  },

  // =================================================================
  // Statistics
  // =================================================================

  async getStats(requestId: string = '-') {
    const [total, pending, approved, rejected, expired, cancelled] = await Promise.all([
      db.approvalRequest.count(),
      db.approvalRequest.count({ where: { status: 'pending' } }),
      db.approvalRequest.count({ where: { status: 'approved' } }),
      db.approvalRequest.count({ where: { status: 'rejected' } }),
      db.approvalRequest.count({ where: { status: 'expired' } }),
      db.approvalRequest.count({ where: { status: 'cancelled' } }),
    ]);
    return { total, pending, approved, rejected, expired, cancelled };
  },

  // =================================================================
  // Auto-Approval Rules Engine
  // =================================================================

  async checkAutoApproval(
    toolName: string,
    riskLevel: string,
    capability?: string,
    requestId: string = '-',
  ): Promise<{ autoApproved: boolean; autoRejected: boolean; matchedRule?: string; reason?: string }> {
    const rules = await db.approvalRule.findMany({
      where: { enabled: true },
      orderBy: { priority: 'desc' },
    });

    for (const rule of rules) {
      if (!this._ruleMatches(rule, toolName, riskLevel, capability)) continue;

      if (rule.action === 'auto_approve') {
        logger.info(requestId, `Auto-approved tool '${toolName}' by rule '${rule.name}'`);
        return { autoApproved: true, autoRejected: false, matchedRule: rule.name, reason: `Auto-approved by rule: ${rule.name}` };
      }

      if (rule.action === 'auto_reject') {
        logger.info(requestId, `Auto-rejected tool '${toolName}' by rule '${rule.name}'`);
        return { autoApproved: false, autoRejected: true, matchedRule: rule.name, reason: `Auto-rejected by rule: ${rule.name}` };
      }

      // require_manual — continue to next rule or fall through to manual
      if (rule.action === 'require_manual') {
        logger.info(requestId, `Rule '${rule.name}' requires manual approval for tool '${toolName}'`);
        // Don't return yet — a higher-priority rule may override; but since we're descending,
        // this is the highest priority match. If it says require_manual, we need manual.
        // However, a later (lower priority) rule shouldn't override this decision.
        // So we return here.
        return { autoApproved: false, autoRejected: false, matchedRule: rule.name, reason: `Requires manual approval per rule: ${rule.name}` };
      }
    }

    // No matching rule — require manual approval
    return { autoApproved: false, autoRejected: false, reason: 'No matching auto-approval rule' };
  },

  // =================================================================
  // Approval Rules CRUD
  // =================================================================

  async createRule(data: ApprovalRuleCreate, requestId: string = '-') {
    const existing = await db.approvalRule.findUnique({ where: { name: data.name } });
    if (existing) throw new Error(`Approval rule '${data.name}' already exists`);

    const rule = await db.approvalRule.create({
      data: {
        name: data.name,
        description: data.description || null,
        enabled: data.enabled !== false,
        matchRiskLevels: data.matchRiskLevels ? JSON.stringify(data.matchRiskLevels) : null,
        matchToolNames: data.matchToolNames ? JSON.stringify(data.matchToolNames) : null,
        matchCapabilities: data.matchCapabilities ? JSON.stringify(data.matchCapabilities) : null,
        action: data.action,
        priority: data.priority || 0,
      },
    });

    logger.info(requestId, `Approval rule created: ${data.name} (${data.action})`);
    return this._ruleToPublic(rule);
  },

  async listRules(requestId: string = '-') {
    const rules = await db.approvalRule.findMany({ orderBy: { priority: 'desc' } });
    return rules.map(r => this._ruleToPublic(r));
  },

  async getRule(id: string, requestId: string = '-') {
    const rule = await db.approvalRule.findUnique({ where: { id } });
    if (!rule) throw new Error(`Approval rule not found: ${id}`);
    return this._ruleToPublic(rule);
  },

  async updateRule(id: string, data: ApprovalRuleUpdate, requestId: string = '-') {
    const rule = await db.approvalRule.findUnique({ where: { id } });
    if (!rule) throw new Error(`Approval rule not found: ${id}`);

    const updateData: Record<string, unknown> = {};
    if (data.description !== undefined) updateData.description = data.description;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.matchRiskLevels !== undefined) updateData.matchRiskLevels = JSON.stringify(data.matchRiskLevels);
    if (data.matchToolNames !== undefined) updateData.matchToolNames = JSON.stringify(data.matchToolNames);
    if (data.matchCapabilities !== undefined) updateData.matchCapabilities = JSON.stringify(data.matchCapabilities);
    if (data.action !== undefined) updateData.action = data.action;
    if (data.priority !== undefined) updateData.priority = data.priority;

    const updated = await db.approvalRule.update({ where: { id }, data: updateData });
    logger.info(requestId, `Approval rule updated: ${updated.name}`);
    return this._ruleToPublic(updated);
  },

  async deleteRule(id: string, requestId: string = '-') {
    const rule = await db.approvalRule.findUnique({ where: { id } });
    if (!rule) throw new Error(`Approval rule not found: ${id}`);
    await db.approvalRule.delete({ where: { id } });
    logger.info(requestId, `Approval rule deleted: ${rule.name}`);
  },

  // =================================================================
  // Internal
  // =================================================================

  _ruleMatches(
    rule: { matchRiskLevels: string | null; matchToolNames: string | null; matchCapabilities: string | null },
    toolName: string,
    riskLevel: string,
    capability?: string,
  ): boolean {
    // If no conditions are set, the rule matches everything
    let hasConditions = false;
    let allConditionsMatch = true;

    if (rule.matchRiskLevels) {
      hasConditions = true;
      const levels: string[] = JSON.parse(rule.matchRiskLevels);
      if (!levels.includes(riskLevel)) allConditionsMatch = false;
    }

    if (rule.matchToolNames) {
      hasConditions = true;
      const patterns: string[] = JSON.parse(rule.matchToolNames);
      const matchesAny = patterns.some(pattern => {
        if (pattern.endsWith('*')) {
          return toolName.startsWith(pattern.slice(0, -1));
        }
        return pattern === toolName;
      });
      if (!matchesAny) allConditionsMatch = false;
    }

    if (rule.matchCapabilities && capability) {
      hasConditions = true;
      const caps: string[] = JSON.parse(rule.matchCapabilities);
      if (!caps.includes(capability)) allConditionsMatch = false;
    }

    // No conditions = matches everything
    if (!hasConditions) return true;

    return allConditionsMatch;
  },

  _toPublic(r: any) {
    return {
      id: r.id,
      missionId: r.missionId,
      toolName: r.toolName,
      capability: r.capability || undefined,
      riskLevel: r.riskLevel,
      status: r.status,
      reason: r.reason || undefined,
      toolInput: r.toolInput ? JSON.parse(r.toolInput) : undefined,
      resolvedBy: r.resolvedBy || undefined,
      resolvedAt: r.resolvedAt?.toISOString() || undefined,
      response: r.response || undefined,
      expiresAt: r.expiresAt?.toISOString() || undefined,
      createdAt: r.createdAt?.toISOString(),
      updatedAt: r.updatedAt?.toISOString(),
    };
  },

  _ruleToPublic(r: any) {
    return {
      id: r.id,
      name: r.name,
      description: r.description || undefined,
      enabled: r.enabled,
      matchRiskLevels: r.matchRiskLevels ? JSON.parse(r.matchRiskLevels) : undefined,
      matchToolNames: r.matchToolNames ? JSON.parse(r.matchToolNames) : undefined,
      matchCapabilities: r.matchCapabilities ? JSON.parse(r.matchCapabilities) : undefined,
      action: r.action,
      priority: r.priority,
      createdAt: r.createdAt?.toISOString(),
      updatedAt: r.updatedAt?.toISOString(),
    };
  },
};
