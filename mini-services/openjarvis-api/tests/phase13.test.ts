import { describe, it, expect, beforeEach } from 'bun:test';
import { db } from '../src/utils/db.js';
import { wakeWordService } from '../src/services/wakeWordService.js';
import { ambientVoiceService } from '../src/services/ambientVoiceService.js';
import { proactiveSpeechService } from '../src/services/proactiveSpeechService.js';
import { avatarService } from '../src/services/avatarService.js';
import { preferenceProposalService } from '../src/services/preferenceProposalService.js';

describe('Phase 13 — Wake Word Service', () => {
  it('creates default config', async () => {
    const config = await wakeWordService.getConfig();
    expect(config.engine).toBe('porcupine');
    expect(config.keyword).toBe('jarvis');
    expect(config.sensitivity).toBe(0.5);
    expect(config.enabled).toBe(false);
  });

  it('updates config', async () => {
    const updated = await wakeWordService.updateConfig({
      enabled: true,
      sensitivity: 0.8,
    });
    expect(updated.enabled).toBe(true);
    expect(updated.sensitivity).toBe(0.8);
  });

  it('returns COOP/COEP headers', () => {
    const headers = wakeWordService.getRequiredHeaders();
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(headers['Cross-Origin-Embedder-Policy']).toBe('require-corp');
  });
});

describe('Phase 13 — Ambient Voice Service', () => {
  it('creates a session', async () => {
    const session = await ambientVoiceService.createSession();
    expect(session.id).toBeDefined();
    expect(session.provider).toBe('gemini_live');
    expect(session.status).toBe('idle');
  });

  it('gets a session by ID', async () => {
    const created = await ambientVoiceService.createSession();
    const session = await ambientVoiceService.getSession(created.id);
    expect(session).not.toBeNull();
    expect(session!.id).toBe(created.id);
  });

  it('updates session status', async () => {
    const session = await ambientVoiceService.createSession();
    const updated = await ambientVoiceService.updateStatus(session.id, 'listening');
    expect(updated.status).toBe('listening');
  });

  it('records audio token usage', async () => {
    const session = await ambientVoiceService.createSession();
    await ambientVoiceService.recordUsage(session.id, 'in', 100);
    await ambientVoiceService.recordUsage(session.id, 'out', 50);
    const updated = await ambientVoiceService.getSession(session.id);
    expect(updated!.audioTokensIn).toBe(100);
    expect(updated!.audioTokensOut).toBe(50);
  });

  it('records silence and checks idle re-arm', async () => {
    const session = await ambientVoiceService.createSession();
    await ambientVoiceService.updateStatus(session.id, 'listening');

    // 30s silence — not enough to re-arm
    const result1 = await ambientVoiceService.recordSilence(session.id, 30000);
    expect(result1!.rearmed).toBe(false);

    // Reset and test with enough silence
    const session2 = await ambientVoiceService.createSession();
    await ambientVoiceService.updateStatus(session2.id, 'listening');
    const result2 = await ambientVoiceService.recordSilence(session2.id, 80000);
    expect(result2!.rearmed).toBe(true);
  });

  it('ends a session', async () => {
    const session = await ambientVoiceService.createSession();
    await ambientVoiceService.storeResumeToken(session.id, 'test-resume-token');
    const ended = await ambientVoiceService.endSession(session.id);
    expect(ended!.status).toBe('ended');
    expect(ended!.resumeToken).toBe('test-resume-token');
  });

  it('lists sessions', async () => {
    await ambientVoiceService.createSession();
    await ambientVoiceService.createSession();
    const sessions = await ambientVoiceService.listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });

  it('returns Gemini Live WebSocket URL when API key is set', () => {
    // Only test URL format, not actual connectivity
    process.env.GEMINI_API_KEY = 'test-key';
    const url = ambientVoiceService.getGeminiLiveWsUrl('test-model');
    expect(url).toContain('wss://');
    expect(url).toContain('test-model');
    expect(url).toContain('test-key');
    delete process.env.GEMINI_API_KEY;
  });
});

describe('Phase 13 — Proactive Speech Service', () => {
  it('creates default config', async () => {
    const config = await proactiveSpeechService.getConfig();
    expect(config.enabled).toBe(false);
    const triggers = JSON.parse(config.triggers);
    expect(triggers).toContain('mission:completed');
  });

  it('updates config', async () => {
    const updated = await proactiveSpeechService.updateConfig({
      enabled: true,
      triggers: ['mission:completed', 'custom:event'],
    });
    expect(updated.enabled).toBe(true);
    const triggers = JSON.parse(updated.triggers);
    expect(triggers).toHaveLength(2);
  });

  it('checks quiet hours (not in quiet hours by default)', async () => {
    const inQuiet = await proactiveSpeechService.isInQuietHours();
    expect(inQuiet).toBe(false); // no quiet hours configured
  });
});

describe('Phase 13 — Avatar Service', () => {
  it('creates default config (disabled)', async () => {
    const config = await avatarService.getConfig();
    expect(config.enabled).toBe(false);
    expect(config.provider).toBe('heygen');
  });

  it('updates config', async () => {
    const updated = await avatarService.updateConfig({
      avatarId: 'test-avatar-id',
    });
    expect(updated.avatarId).toBe('test-avatar-id');
  });

  it('throws when creating HeyGen session without API key', async () => {
    delete process.env.HEYGEN_API_KEY;
    await expect(avatarService.createHeyGenSession()).rejects.toThrow();
  });
});

describe('Phase 14 — Preference Proposals', () => {
  it('creates and accepts a proposal', async () => {
    const proposal = await db.preferenceProposal.create({
      data: {
        capability: 'test_capability',
        proposalType: 'always_allow',
        timesApproved: 3,
        context: JSON.stringify({ reason: 'Test proposal' }),
      },
    });

    const proposals = await preferenceProposalService.listProposals({ status: 'pending' });
    expect(proposals.length).toBeGreaterThan(0);

    // Accept it
    const result = await preferenceProposalService.acceptProposal(proposal.id);
    expect(result.accepted).toBe(true);
    expect(result.capability).toBe('test_capability');

    // Verify it's no longer pending
    const pending = await preferenceProposalService.listProposals({ status: 'pending' });
    const found = pending.find(p => p.id === proposal.id);
    expect(found).toBeUndefined();
  });

  it('dismisses a proposal', async () => {
    const proposal = await db.preferenceProposal.create({
      data: {
        capability: 'dismiss_test',
        proposalType: 'always_allow',
        timesApproved: 1,
      },
    });

    const result = await preferenceProposalService.dismissProposal(proposal.id);
    expect(result.status).toBe('dismissed');
  });
});
