/**
 * Phase 13 — Ambient Voice Service
 *
 * Manages Gemini Live API sessions for real-time duplex voice.
 * Handles session lifecycle, idle re-arm (~60-90s silence),
 * and audio token budget tracking.
 */
import { db } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';

const SILENCE_TIMEOUT_MS = 75_000; // ~75s silence → re-arm to wake-word-only
const MAX_SESSION_DURATION_MS = 9 * 60 * 1000; // ~9min (Gemini Live ~10min cap)

export const ambientVoiceService = {
  /** Create a new ambient voice session */
  async createSession(options?: { model?: string; missionId?: string }) {
    const session = await db.ambientVoiceSession.create({
      data: {
        provider: 'gemini_live',
        status: 'idle',
        model: options?.model || process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-0520',
        missionId: options?.missionId || null,
      },
    });

    logger.info('-', `Ambient voice session created: ${session.id}`);
    eventBus.emit('ambient_voice:session_created', { sessionId: session.id });

    return session;
  },

  /** Get session by ID */
  async getSession(sessionId: string) {
    return db.ambientVoiceSession.findUnique({ where: { id: sessionId } });
  },

  /** Update session status */
  async updateStatus(sessionId: string, status: string, extra?: Record<string, unknown>) {
    const updateData: Record<string, unknown> = { status, lastActivityAt: new Date() };
    if (extra) Object.assign(updateData, extra);

    const session = await db.ambientVoiceSession.update({
      where: { id: sessionId }, data: updateData,
    });

    eventBus.emit('ambient_voice:status_changed', { sessionId, status });
    return session;
  },

  /** Record audio token usage */
  async recordUsage(sessionId: string, direction: 'in' | 'out', tokens: number) {
    const field = direction === 'in' ? 'audioTokensIn' : 'audioTokensOut';
    await db.ambientVoiceSession.update({
      where: { id: sessionId },
      data: { [field]: { increment: tokens } },
    });
  },

  /** Record silence and check for idle re-arm */
  async recordSilence(sessionId: string, silenceMs: number) {
    const session = await db.ambientVoiceSession.findUnique({ where: { id: sessionId } });
    if (!session || session.status === 'idle') return null;

    const totalSilenceMs = session.silenceMs + silenceMs;

    if (totalSilenceMs >= SILENCE_TIMEOUT_MS) {
      // Re-arm: drop from Live session to wake-word-only standby
      await db.ambientVoiceSession.update({
        where: { id: sessionId },
        data: { status: 'idle', silenceMs: 0, lastActivityAt: new Date() },
      });
      logger.info('-', `Ambient voice session ${sessionId} re-armed to idle after ${totalSilenceMs}ms silence`);
      eventBus.emit('ambient_voice:idle_rearm', { sessionId, silenceMs: totalSilenceMs });
      return { rearmed: true, silenceMs: totalSilenceMs };
    }

    await db.ambientVoiceSession.update({
      where: { id: sessionId },
      data: { silenceMs: totalSilenceMs },
    });

    return { rearmed: false, silenceMs: totalSilenceMs };
  },

  /** Reset silence counter (activity detected) */
  async resetSilence(sessionId: string) {
    await db.ambientVoiceSession.update({
      where: { id: sessionId },
      data: { silenceMs: 0, lastActivityAt: new Date() },
    });
  },

  /** Store resume token for session reconnection */
  async storeResumeToken(sessionId: string, token: string) {
    await db.ambientVoiceSession.update({
      where: { id: sessionId },
      data: { resumeToken: token },
    });
  },

  /** End a session and return resume token */
  async endSession(sessionId: string) {
    const session = await db.ambientVoiceSession.findUnique({ where: { id: sessionId } });
    if (!session) return null;

    const updated = await db.ambientVoiceSession.update({
      where: { id: sessionId },
      data: { status: 'ended' },
    });

    eventBus.emit('ambient_voice:session_ended', { sessionId, resumeToken: session.resumeToken });
    return { ...updated, resumeToken: session.resumeToken };
  },

  /** List all sessions */
  async listSessions() {
    return db.ambientVoiceSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  /** Get WebSocket URL for Gemini Live API */
  getGeminiLiveWsUrl(model: string): string {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set — required for Gemini Live');
    return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.StreamGenerateContent?model=${model}&key=${apiKey}`;
  },
};
