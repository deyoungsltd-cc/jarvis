/**
 * Phase 14 — Provider Manager
 *
 * Central service for provider selection, fallback, usage tracking,
 * and cost tier enforcement.
 *
 * Every capability goes through this manager:
 *   1. Get active provider for capability (respects tier)
 *   2. Try to execute via active provider
 *   3. On rate limit/error → try fallback chain (if tier allows)
 *   4. Log usage for routing preference learning
 */
import { db } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';
import {
  CapabilityCategory,
  BaseProvider,
  ProviderHealthResult,
  FallbackEvent,
  ProviderResult,
} from './types.js';

// ---- Provider Instance Cache ----
const providerInstances = new Map<string, BaseProvider>();

export const providerManager = {
  // =================================================================
  // Provider Registration
  // =================================================================

  /** Register a provider instance for a capability */
  registerProvider(provider: BaseProvider) {
    const key = `${provider.capability}:${provider.name}`;
    providerInstances.set(key, provider);
    logger.info('-', `Provider registered: ${provider.name} for ${provider.capability}`);
  },

  /** Get a registered provider instance */
  getProviderInstance(capability: CapabilityCategory, name: string): BaseProvider | undefined {
    return providerInstances.get(`${capability}:${name}`);
  },

  /** List all registered instances */
  listRegistered(): Array<{capability: string; name: string; isFree: boolean}> {
    return Array.from(providerInstances.entries()).map(([key, inst]) => {
      const [capability, name] = key.split(':');
      return { capability, name, isFree: inst.isFree };
    });
  },

  // =================================================================
  // Active Provider Selection (respects cost tier)
  // =================================================================

  /**
   * Get the active provider for a capability, respecting cost tier.
   * On Tier 0, only free providers are considered.
   * Returns the highest-priority enabled provider.
   */
  async getActiveProvider(capability: CapabilityCategory): Promise<BaseProvider | null> {
    const tier = await this.getActiveTier();
    const entries = await db.providerEntry.findMany({
      where: { capability, enabled: true },
      orderBy: { priority: 'desc' },
    });

    for (const entry of entries) {
      // Tier enforcement: skip paid providers if tier doesn't allow
      if (!entry.isFree && !tier.allowPaidPrimary) continue;

      // Check in-memory instance first
      const instance = providerInstances.get(`${capability}:${entry.name}`);
      if (instance) return instance;

      // Provider registered in DB but not in memory — logged, not instantiated
      logger.warn('-', `Provider '${entry.name}' for ${capability} is in DB but not registered in memory`);
    }

    return null;
  },

  /**
   * Get the fallback chain for a capability.
   * Returns ordered list of provider names.
   * Filters by tier (e.g., Tier 0 removes paid fallbacks).
   */
  async getFallbackChain(capability: CapabilityCategory): Promise<string[]> {
    const tier = await this.getActiveTier();

    // Check for explicit fallback chain in DB
    const chain = await db.providerFallbackChain.findUnique({ where: { capability } });
    if (chain && chain.isActive) {
      const entries: string[] = JSON.parse(chain.entries);
      if (!tier.allowPaidFallback) {
        // Filter to free-only
        const freeProviders = await db.providerEntry.findMany({
          where: { capability, isFree: true, enabled: true },
          select: { name: true },
        });
        const freeNames = new Set(freeProviders.map(p => p.name));
        return entries.filter(name => freeNames.has(name));
      }
      return entries;
    }

    // Default: all enabled providers sorted by priority (desc)
    const entries = await db.providerEntry.findMany({
      where: { capability, enabled: true },
      orderBy: { priority: 'desc' },
      select: { name: true, isFree: true },
    });

    if (!tier.allowPaidFallback) {
      return entries.filter(e => e.isFree).map(e => e.name);
    }
    return entries.map(e => e.name);
  },

  /**
   * Execute a capability call with automatic fallback.
   * This is the main entry point for all provider usage.
   */
  async executeWithFallback<T>(
    capability: CapabilityCategory,
    fn: (provider: BaseProvider) => Promise<T>,
    options?: { requestId?: string; missionId?: string },
  ): Promise<ProviderResult<T>> {
    const chain = await this.getFallbackChain(capability);
    const start = Date.now();
    const { requestId = '-', missionId } = options || {};

    if (chain.length === 0) {
      return {
        success: false,
        error: `No providers configured for capability '${capability}'`,
        provider: 'none',
        capability,
        durationMs: Date.now() - start,
      };
    }

    let lastError = '';
    let lastProvider = '';

    for (const providerName of chain) {
      const provider = providerInstances.get(`${capability}:${providerName}`);
      if (!provider) continue;

      lastProvider = providerName;

      try {
        // Health check for degraded providers
        if (await this.isProviderDegraded(capability, providerName)) {
          logger.warn(requestId, `Provider '${providerName}' for ${capability} is degraded, trying next`);
          continue;
        }

        const result = await fn(provider);
        const durationMs = Date.now() - start;

        // Log successful usage
        await this.logUsage({
          capability, provider: providerName, requestId, missionId,
          durationMs, success: true, status: 'completed',
        }).catch(() => {});

        // Update routing preference (success)
        await this.recordRoutingSuccess(capability, providerName, durationMs).catch(() => {});

        // Update provider's lastUsedAt
        await db.providerEntry.update({
          where: { capability_name: { capability, name: providerName } },
          data: { lastUsedAt: new Date(), status: 'available' },
        }).catch(() => {});

        return {
          success: true,
          data: result,
          provider: providerName,
          capability,
          durationMs,
        };
      } catch (err: any) {
        lastError = err.message || String(err);
        const isRateLimited = lastError.includes('429') || lastError.includes('rate') || lastError.includes('quota');

        logger.warn(requestId, `Provider '${providerName}' for ${capability} failed: ${lastError}`);

        // Mark provider status
        await db.providerEntry.update({
          where: { capability_name: { capability, name: providerName } },
          data: {
            status: isRateLimited ? 'rate_limited' : 'unavailable',
            lastError: lastError,
          },
        }).catch(() => {});

        // Log failed usage
        await this.logUsage({
          capability, provider: providerName, requestId, missionId,
          durationMs: Date.now() - start, success: false, error: lastError,
          status: isRateLimited ? 'rate_limited' : 'failed',
        }).catch(() => {});

        // Update routing preference (failure)
        await this.recordRoutingFailure(capability, providerName).catch(() => {});

        // Emit fallback event
        if (chain.indexOf(providerName) < chain.length - 1) {
          const nextProvider = chain[chain.indexOf(providerName) + 1];
          const fallbackEvent: FallbackEvent = {
            capability, fromProvider: providerName, toProvider: nextProvider,
            reason: isRateLimited ? 'rate_limited' : 'error',
            timestamp: new Date(),
          };
          eventBus.emit('provider:fallback', fallbackEvent);
          logger.info(requestId, `Falling back ${capability}: ${providerName} → ${nextProvider} (${fallbackEvent.reason})`);
        }

        // Don't retry on rate limit — it will likely hit again immediately
        if (isRateLimited) break;
      }
    }

    return {
      success: false,
      error: `All providers failed for '${capability}'. Last error: ${lastError}`,
      provider: lastProvider,
      capability,
      durationMs: Date.now() - start,
    };
  },

  // =================================================================
  // Cost Tier Management
  // =================================================================

  /** Get the currently active cost tier */
  async getActiveTier() {
    const tier = await db.costTier.findFirst({ where: { isActive: true } });
    return tier || {
      name: 'tier_0', label: 'Free Only',
      allowPaidFallback: false, allowPaidPrimary: false,
      monthlyCeilingUsd: null,
    };
  },

  /** Set the active cost tier (explicit admin action) */
  async setActiveTier(tierName: string, requestId: string = '-') {
    // Deactivate all tiers
    await db.costTier.updateMany({ data: { isActive: false } });
    // Activate the requested tier
    const tier = await db.costTier.update({
      where: { name: tierName },
      data: { isActive: true },
    });
    if (!tier) throw new Error(`Cost tier '${tierName}' not found`);
    logger.info(requestId, `Cost tier changed to '${tierName}' (${tier.label})`);
    return tier;
  },

  /** Seed default cost tiers if none exist */
  async seedCostTiers() {
    const count = await db.costTier.count();
    if (count > 0) return;

    await db.costTier.createMany({
      data: [
        { name: 'tier_0', label: 'Free Only', description: 'Every capability restricted to $0 providers. Default on fresh install.', allowPaidFallback: false, allowPaidPrimary: false, monthlyCeilingUsd: 0, isActive: true },
        { name: 'tier_1', label: 'Light Paid', description: 'Modest monthly ceiling. Unlocks paid fallbacks for key capabilities.', allowPaidFallback: true, allowPaidPrimary: false, monthlyCeilingUsd: 20 },
        { name: 'tier_2', label: 'Scaled', description: 'Higher ceiling. Paid providers can be primary for more capabilities.', allowPaidFallback: true, allowPaidPrimary: true, monthlyCeilingUsd: 100 },
      ],
    });
    logger.info('-', 'Seeded default cost tiers (tier_0=active)');
  },

  /** Seed default provider entries if none exist */
  async seedProviders() {
    const count = await db.providerEntry.count();
    if (count > 0) return;

    await db.providerEntry.createMany({
      data: [
        // LLM
        { capability: 'llm', name: 'gemini', adapterType: 'builtin', isFree: true, priority: 10, config: JSON.stringify({ envKey: 'GEMINI_API_KEY', defaultModel: 'gemini-2.5-flash' }) },
        { capability: 'llm', name: 'groq', adapterType: 'builtin', isFree: true, priority: 5, config: JSON.stringify({ envKey: 'GROQ_API_KEY', defaultModel: 'llama-3.3-70b-versatile' }) },
        // Search
        { capability: 'search', name: 'tavily', adapterType: 'builtin', isFree: true, priority: 10, config: JSON.stringify({ envKey: 'TAVILY_API_KEY', monthlyQuota: 1000 }) },
        { capability: 'search', name: 'searxng', adapterType: 'builtin', isFree: true, priority: 5, config: JSON.stringify({ envKey: 'SEARXNG_BASE_URL' }) },
        // Voice
        { capability: 'voice_stt', name: 'browser_relay', adapterType: 'builtin', isFree: true, priority: 10, config: '{}' },
        { capability: 'voice_tts', name: 'browser_relay', adapterType: 'builtin', isFree: true, priority: 10, config: '{}' },
        { capability: 'voice_tts', name: 'gemini', adapterType: 'builtin', isFree: true, priority: 5, config: JSON.stringify({ envKey: 'GEMINI_API_KEY' }) },
        // Ambient Voice
        { capability: 'ambient_voice', name: 'gemini_live', adapterType: 'builtin', isFree: true, priority: 10, config: JSON.stringify({ envKey: 'GEMINI_API_KEY', model: 'gemini-2.5-flash-native-audio-preview-0520' }) },
        // Wake Word
        { capability: 'wake_word', name: 'porcupine', adapterType: 'builtin', isFree: true, priority: 10, config: JSON.stringify({ envKey: 'PORCUPINE_ACCESS_KEY' }) },
        { capability: 'wake_word', name: 'openwakeword', adapterType: 'builtin', isFree: true, priority: 5, config: '{}' },
        // Avatar (no real free tier — off by default)
        { capability: 'avatar', name: 'heygen', adapterType: 'builtin', isFree: false, priority: 10, enabled: false, config: JSON.stringify({ envKey: 'HEYGEN_API_KEY' }) },
      ],
    });

    // Create default fallback chains
    await db.providerFallbackChain.createMany({
      data: [
        { capability: 'llm', entries: JSON.stringify(['gemini', 'groq']) },
        { capability: 'search', entries: JSON.stringify(['tavily', 'searxng']) },
        { capability: 'voice_tts', entries: JSON.stringify(['browser_relay', 'gemini']) },
        { capability: 'wake_word', entries: JSON.stringify(['porcupine', 'openwakeword']) },
      ],
    });

    logger.info('-', 'Seeded default provider entries and fallback chains');
  },

  // =================================================================
  // Usage Logging & Routing Preferences
  // =================================================================

  async logUsage(data: {
    capability: string; provider: string; requestId?: string; missionId?: string;
    durationMs: number; success: boolean; error?: string; status: string;
  }) {
    await db.providerUsageLog.create({ data });
  },

  async isProviderDegraded(capability: string, name: string): Promise<boolean> {
    const entry = await db.providerEntry.findUnique({
      where: { capability_name: { capability, name } },
    });
    return entry?.status === 'rate_limited' || entry?.status === 'unavailable';
  },

  async recordRoutingSuccess(capability: string, provider: string, latencyMs: number) {
    const entry = await db.providerRoutingPreference.upsert({
      where: { capability_provider: { capability, provider } },
      create: { capability, provider, successCount: 1, totalLatencyMs: latencyMs, requestCount: 1 },
      update: {
        successCount: { increment: 1 },
        totalLatencyMs: { increment: latencyMs },
        requestCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
    return entry;
  },

  async recordRoutingFailure(capability: string, provider: string) {
    await db.providerRoutingPreference.upsert({
      where: { capability_provider: { capability, provider } },
      create: { capability, provider, failureCount: 1, requestCount: 1 },
      update: { failureCount: { increment: 1 }, requestCount: { increment: 1 } },
    });
  },

  /** Get routing preferences — used for smart provider selection */
  async getRoutingPreferences(capability: string) {
    const entries = await db.providerRoutingPreference.findMany({
      where: { capability },
      orderBy: { lastUsedAt: 'desc' },
    });
    return entries.map(e => ({
      provider: e.provider,
      successRate: e.requestCount > 0 ? e.successCount / e.requestCount : 0,
      avgLatencyMs: e.requestCount > 0 ? Math.round(e.totalLatencyMs / e.requestCount) : 0,
      requestCount: e.requestCount,
    }));
  },

  /** Reset degraded provider status — called periodically or manually */
  async resetDegradedStatus(capability?: string) {
    const where: Record<string, unknown> = {
      status: { in: ['rate_limited', 'unavailable'] },
    };
    if (capability) (where as any).capability = capability;
    const result = await db.providerEntry.updateMany({
      where, data: { status: 'available', lastError: null },
    });
    logger.info('-', `Reset ${result.count} degraded provider(s) to available`);
    return result;
  },

  /** Get provider status overview */
  async getStatusOverview() {
    const entries = await db.providerEntry.findMany({ orderBy: [{ capability: 'asc' }, { priority: 'desc' }] });
    const tier = await this.getActiveTier();
    const chains = await db.providerFallbackChain.findMany();
    return { providers: entries, activeTier: tier.name, fallbackChains: chains };
  },
};
