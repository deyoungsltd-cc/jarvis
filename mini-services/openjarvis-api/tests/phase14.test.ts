import { describe, it, expect, beforeEach } from 'bun:test';
import { db } from '../src/utils/db.js';
import { providerManager } from '../src/providers/providerManager.js';

// These tests run against a real SQLite DB (in test mode)

describe('Phase 14 — Cost Tiers', () => {
  it('seeds default cost tiers', async () => {
    await providerManager.seedCostTiers();
    const tiers = await db.costTier.findMany({ orderBy: { name: 'asc' } });
    expect(tiers.length).toBe(3);
    expect(tiers[0].name).toBe('tier_0');
    expect(tiers[0].isActive).toBe(true);
    expect(tiers[0].allowPaidFallback).toBe(false);
    expect(tiers[1].name).toBe('tier_1');
    expect(tiers[1].allowPaidFallback).toBe(true);
    expect(tiers[2].name).toBe('tier_2');
    expect(tiers[2].allowPaidPrimary).toBe(true);
  });

  it('gets active tier (defaults to tier_0)', async () => {
    const tier = await providerManager.getActiveTier();
    expect(tier.name).toBe('tier_0');
    expect(tier.allowPaidFallback).toBe(false);
    expect(tier.allowPaidPrimary).toBe(false);
  });

  it('switches active tier', async () => {
    await providerManager.setActiveTier('tier_1');
    const tier = await providerManager.getActiveTier();
    expect(tier.name).toBe('tier_1');
    expect(tier.allowPaidFallback).toBe(true);

    // Switch back to tier_0
    await providerManager.setActiveTier('tier_0');
  });

  it('throws on invalid tier name', async () => {
    await expect(providerManager.setActiveTier('tier_nonexistent')).rejects.toThrow();
  });

  it('does not re-seed if tiers exist', async () => {
    await providerManager.seedCostTiers();
    const count = await db.costTier.count();
    expect(count).toBe(3); // not 6
  });
});

describe('Phase 14 — Provider Registry', () => {
  it('seeds default providers', async () => {
    await providerManager.seedProviders();
    const entries = await db.providerEntry.findMany();
    expect(entries.length).toBe(11); // 2 LLM + 2 search + 3 voice + 2 wakeword + 1 ambient + 1 avatar
  });

  it('creates default fallback chains', async () => {
    const chains = await db.providerFallbackChain.findMany();
    expect(chains.length).toBeGreaterThanOrEqual(4);
    const llmChain = chains.find(c => c.capability === 'llm');
    expect(llmChain).toBeDefined();
    const entries = JSON.parse(llmChain!.entries);
    expect(entries[0]).toBe('gemini');
    expect(entries[1]).toBe('groq');
  });

  it('gets fallback chain respecting tier', async () => {
    // On tier_0 (free only), all default providers are free so all should be returned
    const chain = await providerManager.getFallbackChain('llm');
    expect(chain.length).toBeGreaterThan(0);
    expect(chain[0]).toBe('gemini');
  });

  it('gets status overview', async () => {
    const status = await providerManager.getStatusOverview();
    expect(status.providers.length).toBeGreaterThan(0);
    expect(status.activeTier).toBe('tier_0');
    expect(status.fallbackChains.length).toBeGreaterThan(0);
  });

  it('logs provider usage', async () => {
    await providerManager.logUsage({
      capability: 'llm', provider: 'gemini', success: true, durationMs: 150, status: 'completed',
    });
    const logs = await db.providerUsageLog.findMany();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].capability).toBe('llm');
    expect(logs[0].provider).toBe('gemini');
  });

  it('records routing preferences', async () => {
    await providerManager.recordRoutingSuccess('llm', 'gemini', 100);
    await providerManager.recordRoutingSuccess('llm', 'gemini', 200);
    await providerManager.recordRoutingFailure('llm', 'groq');

    const prefs = await providerManager.getRoutingPreferences('llm');
    const gemini = prefs.find(p => p.provider === 'gemini');
    expect(gemini).toBeDefined();
    expect(gemini!.successRate).toBe(1); // 2/2
    expect(gemini!.requestCount).toBe(2);
  });

  it('resets degraded status', async () => {
    await db.providerEntry.updateMany({
      where: { capability: 'llm' },
      data: { status: 'rate_limited' },
    });
    const result = await providerManager.resetDegradedStatus('llm');
    expect(result.count).toBeGreaterThanOrEqual(1);
    const gemini = await db.providerEntry.findFirst({ where: { capability: 'llm', name: 'gemini' } });
    expect(gemini!.status).toBe('available');
  });

  it('executeWithFallback with no providers returns error', async () => {
    const result = await providerManager.executeWithFallback('avatar' as any, async () => 'test');
    // avatar is disabled by default
    expect(result.success).toBe(false);
    expect(result.error).toContain('No providers');
  });
});

describe('Phase 14 — Usage Logging', () => {
  it('creates usage log entries', async () => {
    await db.providerUsageLog.create({
      data: {
        capability: 'search', provider: 'tavily', success: true,
        durationMs: 50, status: 'completed',
      },
    });
    const logs = await db.providerUsageLog.findMany({ where: { capability: 'search' } });
    expect(logs.length).toBeGreaterThan(0);
  });
});
