/**
 * Phase 9 — Opportunity Engine + Approval Types
 */

// ---- Approval Types ----

export const APPROVAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'expired',
  'cancelled',
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const VALID_APPROVAL_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  pending:  ['approved', 'rejected', 'expired', 'cancelled'],
  approved: [], // terminal
  rejected: [], // terminal
  expired:  [], // terminal
  cancelled: [], // terminal
};

export interface ApprovalRequestInput {
  missionId: string;
  toolName: string;
  toolInput?: Record<string, unknown>;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  reason?: string;
  ttlSeconds?: number;
}

export interface ApprovalResolveInput {
  resolvedBy?: string;
}

// ---- Approval Policy Types ----

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalPolicy {
  autoApproveRiskLevels: RiskLevel[];
  requireApprovalRiskLevels: RiskLevel[];
  hardBlockRiskLevels: RiskLevel[];
  defaultTtlSeconds: number;
  trustRepeatedToolUse: boolean;
  trustRepeatLimit: number;
  opportunityEngineEnabled: boolean;
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  autoApproveRiskLevels: ['low'],
  requireApprovalRiskLevels: ['medium', 'high'],
  hardBlockRiskLevels: ['critical'],
  defaultTtlSeconds: 300,
  trustRepeatedToolUse: true,
  trustRepeatLimit: 5,
  opportunityEngineEnabled: true,
};

// ---- Opportunity Types ----

export const OPPORTUNITY_TYPES = [
  'efficiency',
  'quality',
  'safety',
  'discovery',
  'optimization',
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const OPPORTUNITY_STATUSES = [
  'suggested',
  'acknowledged',
  'dismissed',
  'acted_upon',
  'expired',
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const VALID_OPPORTUNITY_TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
  suggested:     ['acknowledged', 'dismissed', 'acted_upon', 'expired'],
  acknowledged:  ['acted_upon', 'dismissed', 'expired'],
  dismissed:     [],
  acted_upon:    [],
  expired:       [],
};

export interface OpportunityAction {
  label: string;
  type: 'adjust_budget' | 'adjust_tool_limit' | 'enable_tool' | 'change_risk' | 'suggest_pause' | 'custom';
  params: Record<string, unknown>;
}

export interface OpportunityInput {
  missionId?: string;
  type: OpportunityType;
  title: string;
  description: string;
  confidence?: number;
  impact?: 'low' | 'medium' | 'high';
  actions?: OpportunityAction[];
  source?: 'system' | 'agent' | 'user';
  ttlSeconds?: number;
}

// ---- Tool execution check result ----

export type ToolCheckResult =
  | { allowed: true }
  | { allowed: false; reason: 'requires_approval'; approvalRequestId: string }
  | { allowed: false; reason: 'hard_blocked'; message: string }
  | { allowed: false; reason: 'not_granted'; message: string };
