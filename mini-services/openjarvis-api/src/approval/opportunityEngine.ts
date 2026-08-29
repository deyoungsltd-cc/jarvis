/**
 * Phase 9 — Opportunity Engine
 * Analyzes mission execution patterns and detects opportunities
 * for optimization, safety improvements, and efficiency gains.
 */
import { db } from '../utils/db.js';
import {
  OpportunityInput,
  OpportunityStatus,
  OpportunityType,
  VALID_OPPORTUNITY_TRANSITIONS,
  OPPORTUNITY_STATUSES,
} from './types.js';
import { emitOpportunityEvent } from '../utils/eventBus.js';

function validateOppTransition(current: string, target: OpportunityStatus): void {
  if (!OPPORTUNITY_STATUSES.includes(current as OpportunityStatus)) {
    throw new Error(`Invalid current opportunity status: '${current}'`);
  }
  const allowed = VALID_OPPORTUNITY_TRANSITIONS[current as OpportunityStatus];
  if (!allowed.includes(target)) {
    throw new Error(
      `Invalid opportunity transition: '${current}' → '${target}'. Allowed: ${allowed.join(', ') || 'none'}`,
    );
  }
}

async function transitionOpportunity(id: string, target: OpportunityStatus, requestId: string) {
  const opp = await db.opportunity.findUnique({ where: { id } });
  if (!opp) {
    const { notFound } = await import('../utils/errors.js');
    throw notFound('OPPORTUNITY_NOT_FOUND', `Opportunity ${id} not found`, requestId);
  }
  validateOppTransition(opp.status, target);

  const updated = await db.opportunity.update({
    where: { id },
    data: { status: target },
  });

  emitOpportunityEvent(updated.id, target, updated);
  return updated;
}

export const opportunityService = {
  async create(input: OpportunityInput, requestId: string) {
    const ttlSeconds = input.ttlSeconds;
    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;

    const opportunity = await db.opportunity.create({
      data: {
        missionId: input.missionId || null,
        type: input.type,
        title: input.title,
        description: input.description,
        confidence: input.confidence ?? 0.5,
        impact: input.impact || 'medium',
        actions: input.actions ? JSON.stringify(input.actions) : null,
        status: 'suggested',
        source: input.source || 'system',
        expiresAt,
      },
    });

    emitOpportunityEvent(opportunity.id, 'created', opportunity);
    return opportunity;
  },

  async getById(id: string, requestId: string) {
    const opp = await db.opportunity.findUnique({ where: { id } });
    if (!opp) {
      const { notFound } = await import('../utils/errors.js');
      throw notFound('OPPORTUNITY_NOT_FOUND', `Opportunity ${id} not found`, requestId);
    }
    return opp;
  },

  async list(filters?: {
    missionId?: string;
    status?: OpportunityStatus;
    type?: OpportunityType;
  }, requestId: string) {
    const where: Record<string, unknown> = {};
    if (filters?.missionId) where.missionId = filters.missionId;
    if (filters?.status) where.status = filters.status;
    if (filters?.type) where.type = filters.type;

    return db.opportunity.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'desc' },
    });
  },

  async acknowledge(id: string, requestId: string) {
    return transitionOpportunity(id, 'acknowledged', requestId);
  },

  async dismiss(id: string, requestId: string) {
    return transitionOpportunity(id, 'dismissed', requestId);
  },

  async markActedUpon(id: string, requestId: string) {
    return transitionOpportunity(id, 'acted_upon', requestId);
  },

  async expire(id: string, requestId: string) {
    return transitionOpportunity(id, 'expired', requestId);
  },

  async expireOverdue(requestId: string): Promise<number> {
    const now = new Date();
    const overdue = await db.opportunity.findMany({
      where: { status: 'suggested', expiresAt: { lt: now } },
    });
    let count = 0;
    for (const opp of overdue) {
      await transitionOpportunity(opp.id, 'expired', requestId);
      count++;
    }
    return count;
  },
};

/**
 * Analyze a mission and detect opportunities.
 * Called by the agent loop periodically.
 */
export async function analyzeForOpportunities(params: {
  missionId: string;
  iterationsCompleted: number;
  maxIterations: number;
  tokensUsed: number;
  tokenBudget: number;
  toolCallCount: number;
  maxToolCalls: number;
  requestId: string;
}): Promise<void> {
  const { missionId, iterationsCompleted, maxIterations, tokensUsed, tokenBudget, toolCallCount, maxToolCalls, requestId } = params;
  const opportunities: OpportunityInput[] = [];

  // 1. Budget running low (efficiency)
  const tokenRatio = tokensUsed / tokenBudget;
  if (tokenRatio > 0.7 && tokenRatio < 0.95) {
    const remaining = tokenBudget - tokensUsed;
    opportunities.push({
      missionId,
      type: 'efficiency',
      title: 'Token budget running low',
      description: `${Math.round(tokenRatio * 100)}% of token budget consumed (${tokensUsed}/${tokenBudget}). Approximately ${remaining} tokens remaining.`,
      confidence: 0.9,
      impact: 'high',
      actions: [
        { label: `Increase budget to ${Math.round(tokenBudget * 1.5)}`, type: 'adjust_budget', params: { budget: Math.round(tokenBudget * 1.5) } },
        { label: 'Pause mission for review', type: 'suggest_pause', params: {} },
      ],
      source: 'system',
      ttlSeconds: 600,
    });
  }

  // 2. Approaching iteration limit (optimization)
  const iterationRatio = iterationsCompleted / maxIterations;
  if (iterationRatio > 0.7) {
    opportunities.push({
      missionId,
      type: 'optimization',
      title: 'Approaching iteration limit',
      description: `${iterationsCompleted}/${maxIterations} iterations completed.`,
      confidence: 0.85,
      impact: 'medium',
      actions: [
        { label: `Increase max iterations to ${Math.round(maxIterations * 1.5)}`, type: 'adjust_tool_limit', params: { maxToolCalls: Math.round(maxIterations * 1.5) } },
      ],
      source: 'system',
      ttlSeconds: 600,
    });
  }

  // 3. High tool call count (discovery)
  if (toolCallCount > maxToolCalls * 0.5 && iterationsCompleted > 3) {
    opportunities.push({
      missionId,
      type: 'discovery',
      title: 'High tool usage detected',
      description: `${toolCallCount} tool calls made across ${iterationsCompleted} iterations.`,
      confidence: 0.6,
      impact: 'medium',
      actions: [
        { label: 'Review and adjust mission goal', type: 'custom', params: { suggestion: 'Consider breaking into smaller sub-missions.' } },
      ],
      source: 'system',
      ttlSeconds: 900,
    });
  }

  // 4. Safety: pending approval requests
  if (toolCallCount > 0) {
    const pendingApprovals = await db.approvalRequest.count({
      where: { missionId, status: 'pending' },
    });
    if (pendingApprovals > 0) {
      opportunities.push({
        missionId,
        type: 'safety',
        title: 'Pending approval requests',
        description: `There ${pendingApprovals === 1 ? 'is' : 'are'} ${pendingApprovals} pending approval request${pendingApprovals === 1 ? '' : 's'} for this mission.`,
        confidence: 1.0,
        impact: 'high',
        source: 'system',
        ttlSeconds: 300,
      });
    }
  }

  for (const opp of opportunities) {
    await opportunityService.create(opp, requestId);
  }
}
