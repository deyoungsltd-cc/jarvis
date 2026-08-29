/**
 * Phase 13 — HeyGen LiveAvatar Service
 *
 * Backend service for managing HeyGen real-time avatar sessions.
 * Session tokens are created server-side — the API key is NEVER exposed to the browser.
 *
 * Key constraints (verified 2026-08-18):
 *   - Uses @heygen/liveavatar-web-sdk (new SDK, NOT the deprecated Interactive Avatar SDK)
 *   - Session token created via streaming.create_token API
 *   - WebRTC for real-time two-way video
 *   - Trial: 3 concurrent sessions max (irrelevant for single-user)
 *   - Separate from the HyperFrames-by-HeyGen connector
 *
 * Graceful degradation: if HeyGen fails, the system falls back to
 * the Phase 3 agent-state.tsx indicator and audio-only response.
 */
import { logger } from '../utils/logger.js';
import { v4 as uuid } from 'uuid';
import type { AvatarSession, AvatarSessionState, AvatarTokenResponse } from '../ambient/types.js';

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY || '';
const HEYGEN_API_URL = 'https://api.heygen.com';

// ---- Session State ----

let currentSession: AvatarSession | null = null;
let avatarId: string | null = process.env.HEYGEN_AVATAR_ID || null;
let voiceId: string | null = process.env.HEYGEN_VOICE_ID || null;

// Callback for when avatar speaks (to sync with ambient/TTS)
let onAvatarSpeaking: ((speaking: boolean) => void) | null = null;

// ---- Service ----

export const avatarService = {
  /** Check if HeyGen is configured */
  isConfigured(): boolean {
    return !!HEYGEN_API_KEY;
  },

  /** Get current session state */
  getSession(): AvatarSession | null {
    return currentSession;
  },

  /** Get avatar configuration */
  getConfig(): { avatarId: string | null; voiceId: string | null; configured: boolean } {
    return { avatarId, voiceId, configured: this.isConfigured() };
  },

  /** Set avatar/voice IDs */
  setConfig(updates: { avatarId?: string; voiceId?: string }) {
    if (updates.avatarId !== undefined) avatarId = updates.avatarId;
    if (updates.voiceId !== undefined) voiceId = updates.voiceId;
    return this.getConfig();
  },

  /**
   * Create a session token for the HeyGen LiveAvatar.
   * This is server-side only — the API key never leaves the server.
   */
  async createSessionToken(): Promise<AvatarTokenResponse> {
    if (!HEYGEN_API_KEY) {
      throw new Error('HEYGEN_API_KEY not configured. Set the env var to enable avatar.');
    }

    const resp = await fetch(`${HEYGEN_API_URL}/v2/streaming.create_token`, {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        avatar_id: avatarId,
        voice: { type: 'text', input: '' },
        ...(voiceId ? { voice_id: voiceId } : {}),
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      logger.error('avatar', `Failed to create session token: ${resp.status} ${errBody}`);
      throw new Error(`HeyGen API error: ${resp.status} ${errBody}`);
    }

    const data = await resp.json();
    logger.info('avatar', 'Session token created successfully');

    return {
      token: data.data?.token || data.token,
      expiresAt: data.data?.expires_at || new Date(Date.now() + 3600000).toISOString(),
      serverUrl: data.data?.server_url || data.server_url || 'wss://api.heygen.com',
    };
  },

  /**
   * Initialize an avatar session.
   * Creates the token, sets up the WebRTC session.
   * The actual WebRTC connection is handled client-side using the token.
   */
  async startSession(options?: { avatarId?: string }): Promise<AvatarSession> {
    if (currentSession && currentSession.state === 'connected') {
      logger.warn('avatar', 'Avatar session already active, reusing');
      return currentSession;
    }

    const sess: AvatarSession = {
      id: uuid(),
      state: 'connecting',
      sessionId: null,
      token: null,
      webrtcOffer: null,
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    currentSession = sess;

    try {
      const tokenResp = await this.createSessionToken();
      sess.token = tokenResp.token;
      sess.state = 'connected';
      sess.lastActivityAt = new Date();
      logger.info('avatar', `Avatar session ready: ${sess.id}`);
    } catch (err: any) {
      sess.state = 'error';
      logger.error('avatar', `Avatar session failed: ${err.message}`);
      throw err;
    }

    return sess;
  },

  /** Send text to the avatar for lip-synced speech */
  speak(text: string) {
    if (!currentSession || currentSession.state !== 'connected') {
      return;
    }

    currentSession.state = 'speaking';
    currentSession.lastActivityAt = new Date();
    if (onAvatarSpeaking) onAvatarSpeaking(true);

    logger.info('avatar', `Speaking: "${text.substring(0, 60)}..."`);

    // The actual text-to-avatar is handled client-side via the
    // @heygen/liveavatar-web-sdk using the session token.
    // The server sends the text via WebSocket for the frontend to relay.

    // Return a mock duration; real duration depends on TTS processing
    setTimeout(() => {
      if (currentSession) {
        currentSession.state = 'connected';
        if (onAvatarSpeaking) onAvatarSpeaking(false);
      }
    }, Math.max(text.length * 60, 1000)); // ~60ms per char estimate
  },

  /** End the avatar session */
  async endSession() {
    if (!currentSession) return;

    logger.info('avatar', `Ending avatar session: ${currentSession.id}`);
    currentSession.state = 'disconnected';
    currentSession = null;
  },

  /** Set callback for avatar speaking state */
  onSpeakingCb(cb: (speaking: boolean) => void) {
    onAvatarSpeaking = cb;
  },
};
