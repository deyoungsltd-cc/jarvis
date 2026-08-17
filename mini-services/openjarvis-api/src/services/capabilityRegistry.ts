/**
 * Capability Registry — Phase 10 Authorization Model
 *
 * "The admin is the policy."
 *
 * A flat, admin-editable list: capability_id → allowed (bool) → scope/context (optional).
 * Nothing is enabled by default. Every capability starts undefined until explicitly granted.
 *
 * Three states per capability:
 *   1. UNDEFINED — not yet decided. Pauses and asks (does NOT silently fail/refuse).
 *   2. ALLOWED   — admin has explicitly granted. Execute immediately.
 *   3. DENIED    — admin has explicitly denied. Block with reason.
 *
 * Grants can be scoped:
 *   - permanent: always allowed/denied
 *   - mission:  only for a specific mission
 *   - session:  for this server session (in-memory hint, but persisted)
 *
 * Scope context: optional JSON constraint, e.g. {"pathPrefix": "/projects/"}.
 * Revocation takes effect immediately, including for missions in progress.
 */
import { db } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';

export type GrantStatus = 'allowed' | 'denied' | 'undefined';
export type ScopeType = 'permanent' | 'mission' | 'session';

export interface CapabilityGrantCreate {
  capability: string;
  allowed: boolean;
  scopeType?: ScopeType;
  scopeContext?: Record<string, unknown>; // e.g. { pathPrefix: "/projects/" }
  missionId?: string;
  source?: 'manual' | 'approval_always_allow';
  approvalRequestId?: string;
}

export interface CapabilityGrantUpdate {
  allowed?: boolean;
  scopeType?: ScopeType;
  scopeContext?: Record<string, unknown> | null;
  enabled?: boolean; // alias for allowed
}

export interface CapabilityCheckResult {
  status: GrantStatus; // 'allowed' | 'denied' | 'undefined'
  grantId?: string;     // if a grant was matched
  reason?: string;      // human-readable explanation
}

export const capabilityRegistry = {
  // =================================================================
  // Core check — the authorization decision
  // =================================================================

  /**
   * Check if a capability is authorized.
   *
   * This is the single binary gate from the spec:
   *  - If explicitly allowed (and scope matches) → { status: 'allowed' }
   *  - If explicitly denied → { status: 'denied' }
   *  - If no grant exists (undefined) → { status: 'undefined' }
   *
   * The caller decides what to do with 'undefined' (pause and ask).
   * The caller decides what to do with 'denied' (block).
   * Only 'allowed' means execute.
   */
  async check(
    capability: string,
    context?: {
      missionId?: string;
      toolInput?: Record<string, unknown>; // for scope context matching
    },
    requestId: string = '-',
  ): Promise<CapabilityCheckResult> {
    // Query all grants for this capability, most recent first
    const grants = await db.capabilityGrant.findMany({
      where: { capability },
      orderBy: { updatedAt: 'desc' },
    });

    if (grants.length === 0) {
      // Undefined — not yet decided. This is NOT a denial.
      return { status: 'undefined', reason: `Capability '${capability}' has no grant (undefined). Pausing to ask admin.` };
    }

    // Check for an applicable grant:
    // 1. Mission-scoped grants for this specific mission (highest priority)
    // 2. Session/permanent grants
    const missionId = context?.missionId;

    // First, check mission-scoped grants
    if (missionId) {
      const missionGrant = grants.find(
        g => g.scopeType === 'mission' && g.missionId === missionId,
      );
      if (missionGrant) {
        if (this._scopeMatches(missionGrant, context?.toolInput)) {
          return missionGrant.allowed
            ? { status: 'allowed', grantId: missionGrant.id, reason: `Mission-scoped grant allows '${capability}'` }
            : { status: 'denied', grantId: missionGrant.id, reason: `Mission-scoped grant denies '${capability}'` };
        }
      }
    }

    // Then check permanent/session grants (most recently updated wins)
    const generalGrant = grants.find(
      g => g.scopeType === 'permanent' || g.scopeType === 'session',
    );
    if (generalGrant) {
      if (this._scopeMatches(generalGrant, context?.toolInput)) {
        return generalGrant.allowed
          ? { status: 'allowed', grantId: generalGrant.id, reason: `Grant allows '${capability}'` }
          : { status: 'denied', grantId: generalGrant.id, reason: `Grant denies '${capability}'` };
      }
      // Scope didn't match — fall through to undefined behavior
      return {
        status: 'undefined',
        reason: `Capability '${capability}' has a grant but scope context doesn't match. Pausing to ask admin.`,
      };
    }

    // Only mission-scoped grants exist, but not for this mission
    return { status: 'undefined', reason: `Capability '${capability}' has no applicable grant for this context. Pausing to ask admin.` };
  },

  // =================================================================
  // Grant CRUD
  // =================================================================

  async grant(data: CapabilityGrantCreate, requestId: string = '-') {
    const scopeContext = data.scopeContext ? JSON.stringify(data.scopeContext) : null;

    const grant = await db.capabilityGrant.create({
      data: {
        capability: data.capability,
        allowed: data.allowed,
        scopeType: data.scopeType || 'permanent',
        scopeContext,
        missionId: data.missionId || null,
        source: data.source || 'manual',
        approvalRequestId: data.approvalRequestId || null,
      },
    });

    logger.info(requestId, `Capability grant ${data.allowed ? 'ALLOWED' : 'DENIED'}: '${data.capability}' (scope: ${data.scopeType || 'permanent'}, source: ${data.source || 'manual'})`);

    eventBus.emit('capability:grant_changed', {
      capability: data.capability,
      allowed: data.allowed,
      grantId: grant.id,
      source: data.source || 'manual',
    });

    return this._toPublic(grant);
  },

  async list(filters?: {
    capability?: string;
    allowed?: boolean;
    scopeType?: ScopeType;
    missionId?: string;
    limit?: number;
    offset?: number;
  }, requestId: string = '-') {
    const where: Record<string, unknown> = {};
    if (filters?.capability) where.capability = filters.capability;
    if (filters?.allowed !== undefined) where.allowed = filters.allowed;
    if (filters?.scopeType) where.scopeType = filters.scopeType;
    if (filters?.missionId) where.missionId = filters.missionId;

    const grants = await db.capabilityGrant.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: filters?.limit || 100,
      skip: filters?.offset || 0,
    });

    const total = await db.capabilityGrant.count({ where });

    return {
      items: grants.map(g => this._toPublic(g)),
      total,
      limit: filters?.limit || 100,
      offset: filters?.offset || 0,
    };
  },

  async getById(id: string, requestId: string = '-') {
    const grant = await db.capabilityGrant.findUnique({ where: { id } });
    if (!grant) throw new Error(`Capability grant not found: ${id}`);
    return this._toPublic(grant);
  },

  async update(id: string, data: CapabilityGrantUpdate, requestId: string = '-') {
    const grant = await db.capabilityGrant.findUnique({ where: { id } });
    if (!grant) throw new Error(`Capability grant not found: ${id}`);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.allowed !== undefined) updateData.allowed = data.allowed;
    if (data.scopeType !== undefined) updateData.scopeType = data.scopeType;
    if (data.scopeContext !== undefined) {
      updateData.scopeContext = data.scopeContext ? JSON.stringify(data.scopeContext) : null;
    }

    const updated = await db.capabilityGrant.update({ where: { id }, data: updateData });

    logger.info(requestId, `Capability grant updated: '${updated.capability}' → allowed=${updated.allowed}`);

    eventBus.emit('capability:grant_changed', {
      capability: updated.capability,
      allowed: updated.allowed,
      grantId: updated.id,
      source: 'manual',
    });

    return this._toPublic(updated);
  },

  /**
   * Revoke a capability grant.
   * Takes effect immediately, including for missions already in progress.
   */
  async revoke(id: string, requestId: string = '-') {
    const grant = await db.capabilityGrant.findUnique({ where: { id } });
    if (!grant) throw new Error(`Capability grant not found: ${id}`);

    await db.capabilityGrant.delete({ where: { id } });

    logger.info(requestId, `Capability grant REVOKED: '${grant.capability}' (was ${grant.allowed ? 'allowed' : 'denied'})`);

    eventBus.emit('capability:grant_changed', {
      capability: grant.capability,
      allowed: undefined, // revoked = back to undefined
      grantId: id,
      source: 'manual',
    });

    return { revoked: true, capability: grant.capability };
  },

  /**
   * Revoke ALL grants for a specific capability.
   * Useful for full reset of a capability's authorization status.
   */
  async revokeAll(capability: string, requestId: string = '-') {
    const result = await db.capabilityGrant.deleteMany({ where: { capability } });

    logger.info(requestId, `All capability grants REVOKED for '${capability}' (${result.count} grants removed)`);

    eventBus.emit('capability:grant_changed', {
      capability,
      allowed: undefined,
      source: 'manual',
    });

    return { revoked: true, capability, count: result.count };
  },

  /**
   * Get the current authorization status for all known capabilities.
   * Returns a map of capability → { status, grantId?, scopeType? }
   */
  async getAllStatuses(requestId: string = '-') {
    const grants = await db.capabilityGrant.findMany({
      orderBy: { capability: 'asc' },
    });

    // Build a map: capability → most recent general grant
    const statusMap = new Map<string, { status: GrantStatus; grantId?: string; scopeType?: string; allowed?: boolean }>();

    for (const g of grants) {
      const existing = statusMap.get(g.capability);
      // Prefer permanent/session grants over mission-scoped for the overview
      if (!existing || (g.scopeType !== 'mission' && existing.scopeType === 'mission')) {
        statusMap.set(g.capability, {
          status: g.allowed ? 'allowed' : 'denied',
          grantId: g.id,
          scopeType: g.scopeType,
          allowed: g.allowed,
        });
      }
    }

    return Object.fromEntries(statusMap);
  },

  // =================================================================
  // Internal
  // =================================================================

  /**
   * Check if a grant's scope context matches the tool input.
   * If the grant has no scope context, it matches everything (broad grant).
   */
  _scopeMatches(grant: { scopeContext: string | null }, toolInput?: Record<string, unknown>): boolean {
    if (!grant.scopeContext) return true; // No scope constraint = matches everything

    try {
      const scope = JSON.parse(grant.scopeContext);
      if (!toolInput) return false; // Grant has scope but no input to match against

      // Check pathPrefix constraint (for filesystem tools)
      if (scope.pathPrefix && toolInput.path) {
        return String(toolInput.path).startsWith(scope.pathPrefix);
      }

      // Check domain constraint (for network tools)
      if (scope.domain && toolInput.url) {
        return String(toolInput.url).includes(scope.domain);
      }

      // Generic key-value matching
      for (const [key, value] of Object.entries(scope)) {
        if (key === 'pathPrefix' || key === 'domain') continue; // already handled
        if (toolInput[key] !== value) return false;
      }

      return true;
    } catch {
      return true; // If scope context is malformed, don't block
    }
  },

  _toPublic(g: any) {
    return {
      id: g.id,
      capability: g.capability,
      allowed: g.allowed,
      scopeType: g.scopeType,
      scopeContext: g.scopeContext ? JSON.parse(g.scopeContext) : undefined,
      missionId: g.missionId || undefined,
      source: g.source,
      approvalRequestId: g.approvalRequestId || undefined,
      createdAt: g.createdAt?.toISOString(),
      updatedAt: g.updatedAt?.toISOString(),
    };
  },
};
