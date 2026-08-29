/**
 * Phase 13 — Wake Word Service
 *
 * Manages wake word detection configuration.
 * Actual detection runs client-side (Porcupine Web SDK or openWakeWord).
 * This service provides config, COOP/COEP header requirements, and status.
 */
import { db } from '../utils/db.js';
import { logger } from '../utils/logger.js';

export const wakeWordService = {
  /** Get current wake word configuration */
  async getConfig() {
    let config = await db.wakeWordConfig.findFirst();
    if (!config) {
      config = await db.wakeWordConfig.create({
        data: { engine: 'porcupine', keyword: 'jarvis', sensitivity: 0.5 },
      });
    }
    return config;
  },

  /** Update wake word configuration */
  async updateConfig(data: {
    engine?: string;
    enabled?: boolean;
    keyword?: string;
    sensitivity?: number;
    config?: Record<string, unknown>;
  }) {
    const current = await this.getConfig();
    const updateData: Record<string, unknown> = {};
    if (data.engine !== undefined) updateData.engine = data.engine;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.keyword !== undefined) updateData.keyword = data.keyword;
    if (data.sensitivity !== undefined) updateData.sensitivity = data.sensitivity;
    if (data.config !== undefined) updateData.config = JSON.stringify(data.config);

    const updated = await db.wakeWordConfig.update({
      where: { id: current.id }, data: updateData,
    });
    logger.info('-', `Wake word config updated: engine=${updated.engine}, enabled=${updated.enabled}`);
    return updated;
  },

  /** Get COOP/COEP headers required for Porcupine */
  getRequiredHeaders() {
    return {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    };
  },
};
