/**
 * Phase 13 — Proactive Speech Service
 *
 * Subscribes to eventBus events and converts them to speech.
 * Admin-configured trigger list, quiet-hours support.
 * The agent does NOT decide what to say proactively — only
 * events on the configured trigger list generate speech.
 */
import { db } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';

export const proactiveSpeechService = {
  _initialized: false,

  /** Initialize — subscribe to eventBus and set up trigger listeners */
  async init() {
    if (this._initialized) return;
    this._initialized = true;

    const config = await this.getConfig();
    if (!config.enabled) return;

    const triggers: string[] = JSON.parse(config.triggers);
    logger.info('-', `Proactive speech initialized with ${triggers.length} triggers`);

    for (const trigger of triggers) {
      eventBus.on(trigger, async (data: any) => {
        await this._handleTrigger(trigger, data);
      });
    }
  },

  /** Get proactive speech configuration */
  async getConfig() {
    let config = await db.proactiveSpeechConfig.findFirst();
    if (!config) {
      config = await db.proactiveSpeechConfig.create({
        data: {
          enabled: false,
          triggers: JSON.stringify(['mission:completed', 'approval:requested']),
          voiceProvider: 'browser_relay',
          maxCharsPerEvent: 200,
        },
      });
    }
    return config;
  },

  /** Update configuration */
  async updateConfig(data: {
    enabled?: boolean;
    triggers?: string[];
    quietHoursStart?: string;
    quietHoursEnd?: string;
    voiceProvider?: string;
    voiceId?: string;
    maxCharsPerEvent?: number;
  }) {
    const current = await this.getConfig();
    const updateData: Record<string, unknown> = {};
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.triggers !== undefined) updateData.triggers = JSON.stringify(data.triggers);
    if (data.quietHoursStart !== undefined) updateData.quietHoursStart = data.quietHoursStart;
    if (data.quietHoursEnd !== undefined) updateData.quietHoursEnd = data.quietHoursEnd;
    if (data.voiceProvider !== undefined) updateData.voiceProvider = data.voiceProvider;
    if (data.voiceId !== undefined) updateData.voiceId = data.voiceId;
    if (data.maxCharsPerEvent !== undefined) updateData.maxCharsPerEvent = data.maxCharsPerEvent;

    const updated = await db.proactiveSpeechConfig.update({
      where: { id: current.id }, data: updateData,
    });
    logger.info('-', `Proactive speech config updated: enabled=${updated.enabled}`);
    return updated;
  },

  /** Check if we're in quiet hours */
  async isInQuietHours(): Promise<boolean> {
    const config = await this.getConfig();
    if (!config.quietHoursStart || !config.quietHoursEnd) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = config.quietHoursStart.split(':').map(Number);
    const [endH, endM] = config.quietHoursEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    // Crosses midnight (e.g., 22:00 - 08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  },

  /** Handle a triggered event */
  async _handleTrigger(trigger: string, data: any) {
    // Check quiet hours
    if (await this.isInQuietHours()) {
      logger.info('-', `Proactive speech suppressed (quiet hours) for trigger: ${trigger}`);
      return;
    }

    const config = await this.getConfig();
    if (!config.enabled) return;

    // Generate speech text from event data
    const text = this._generateSpeechText(trigger, data);
    if (!text) return;

    // Truncate to maxCharsPerEvent
    const truncated = text.slice(0, config.maxCharsPerEvent);

    // Emit proactive speech event (frontend handles TTS)
    eventBus.emit('proactive_speech:speak', {
      trigger,
      text: truncated,
      voiceProvider: config.voiceProvider,
      voiceId: config.voiceId,
      timestamp: new Date().toISOString(),
    });

    logger.info('-', `Proactive speech triggered by '${trigger}': "${truncated.slice(0, 60)}..."`);
  },

  /** Generate human-readable speech from event data */
  _generateSpeechText(trigger: string, data: any): string | null {
    switch (trigger) {
      case 'mission:completed':
        return `Mission complete. ${data?.goal || 'The task has been finished.'}`;
      case 'mission:failed':
        return `Mission failed. ${data?.error || 'Something went wrong.'}`;
      case 'approval:requested':
        return `Approval needed for ${data?.toolName || 'a tool call'}. ${data?.reason || ''}`.trim();
      case 'capability:grant_changed':
        if (data?.allowed === true) return `Permission granted for ${data?.capability}.`;
        if (data?.allowed === false) return `Permission revoked for ${data?.capability}.`;
        return null;
      case 'provider:fallback':
        return `Switching from ${data?.fromProvider} to ${data?.toProvider} for ${data?.capability}.`;
      default:
        return null;
    }
  },

  /** Re-initialize (after config change) */
  reinit() {
    this._initialized = false;
    return this.init();
  },
};
