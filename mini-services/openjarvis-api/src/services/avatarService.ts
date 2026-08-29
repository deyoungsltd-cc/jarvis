/**
 * Phase 13 — Avatar Service
 *
 * Manages talking-head avatar configuration.
 * Optional and off by default — no real free tier exists.
 * HeyGen LiveAvatar integration (WebRTC, session tokens created server-side).
 */
import { db } from '../utils/db.js';
import { logger } from '../utils/logger.js';

export const avatarService = {
  /** Get avatar configuration */
  async getConfig() {
    let config = await db.avatarConfig.findFirst();
    if (!config) {
      config = await db.avatarConfig.create({
        data: { provider: 'heygen', enabled: false },
      });
    }
    return config;
  },

  /** Update avatar configuration */
  async updateConfig(data: {
    provider?: string;
    enabled?: boolean;
    avatarId?: string;
    config?: Record<string, unknown>;
  }) {
    const current = await this.getConfig();
    const updateData: Record<string, unknown> = {};
    if (data.provider !== undefined) updateData.provider = data.provider;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.avatarId !== undefined) updateData.avatarId = data.avatarId;
    if (data.config !== undefined) updateData.config = JSON.stringify(data.config);

    const updated = await db.avatarConfig.update({
      where: { id: current.id }, data: updateData,
    });
    logger.info('-', `Avatar config updated: provider=${updated.provider}, enabled=${updated.enabled}`);
    return updated;
  },

  /**
   * Create a HeyGen Live Avatar session token.
   * This must happen server-side — the API key never reaches the client.
   */
  async createHeyGenSession(): Promise<{ sessionId: string; sdpOffer?: string; iceServers?: any[]; status: string }> {
    const config = await this.getConfig();
    if (!config.enabled || config.provider !== 'heygen') {
      throw new Error('Avatar is not enabled or not configured for HeyGen');
    }

    const apiKey = process.env.HEYGEN_API_KEY;
    if (!apiKey) throw new Error('HEYGEN_API_KEY is not set');

    const avatarId = config.avatarId || process.env.HEYGEN_AVATAR_ID;
    if (!avatarId) throw new Error('No avatar ID configured');

    try {
      // HeyGen Live Avatar API — create session
      const response = await fetch('https://api.heygen.com/v2/streaming/avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify({
          avatar_id: avatarId,
          knowledge_id: '', // optional: link to knowledge base
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HeyGen API error ${response.status}: ${text}`);
      }

      const data = await response.json() as any;
      logger.info('-', `HeyGen avatar session created: ${data.session_id}`);

      return {
        sessionId: data.session_id,
        sdpOffer: data.sdp_offer,
        iceServers: data.ice_servers,
        status: 'connecting',
      };
    } catch (err: any) {
      logger.error('-', `HeyGen session creation failed: ${err.message}`);
      throw err;
    }
  },
};
