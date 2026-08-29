/**
 * Phase 13 — Proactive Speech Trigger Engine
 *
 * JARVIS sometimes speaks first. This is an event-to-speech decision service
 * that subscribes to the existing eventBus and produces unprompted speech
 * when configured triggers fire.
 *
 * Key design decisions:
 *   - EXPLICIT trigger list only — JARVIS never invents reasons to speak unprompted
 *   - Admin-configured triggers (same "you are the policy" model as Authorization)
 *   - Quiet hours / do-not-disturb support
 *   - Every proactive utterance logged as a mission_event for auditability
 *   - Routes through the same HeyGen avatar / TTS output as responsive speech
 */
import { eventBus } from '../utils/eventBus.js';
import { missionEventService } from '../services/missionEventService.js';
import { logger } from '../utils/logger.js';
import { v4 as uuid } from 'uuid';
import type {
  ProactiveTriggerType,
  ProactiveTriggerConfig,
  ProactiveSpeechEvent,
  QuietHoursConfig,
} from '../ambient/types.js';

// ---- Default Trigger Configurations ----

const DEFAULT_TRIGGERS: Record<ProactiveTriggerType, ProactiveTriggerConfig> = {
  mission_completed: {
    type: 'mission_completed',
    enabled: true,
    messageTemplate: 'Your mission has been completed successfully.',
    cooldownMs: 30_000, // 30 seconds between mission-complete notifications
  },
  mission_failed: {
    type: 'mission_failed',
    enabled: true,
    messageTemplate: 'A mission has failed. You may want to review what happened.',
    cooldownMs: 30_000,
  },
  mission_blocked: {
    type: 'mission_blocked',
    enabled: true,
    messageTemplate: 'A mission was blocked. It exceeded its budget or tool call limit.',
    cooldownMs: 30_000,
  },
  approval_pending: {
    type: 'approval_pending',
    enabled: true,
    messageTemplate: 'An action is waiting for your approval.',
    cooldownMs: 120_000, // 2 minutes — don't nag about approvals
  },
  budget_cap_hit: {
    type: 'budget_cap_hit',
    enabled: true,
    messageTemplate: 'The daily audio budget has been reached. Ambient voice is paused.',
    cooldownMs: 300_000, // 5 minutes
  },
  error_occurred: {
    type: 'error_occurred',
    enabled: false, // Off by default — errors can be noisy
    messageTemplate: 'An error has occurred in the system.',
    cooldownMs: 60_000,
  },
};

// ---- Default Quiet Hours ----

const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  enabled: false,
  start: '23:00',
  end: '07:00',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

// ---- Service State ----

let triggers: Record<ProactiveTriggerType, ProactiveTriggerConfig> = { ...DEFAULT_TRIGGERS };
let quietHours: QuietHoursConfig = { ...DEFAULT_QUIET_HOURS };
let lastTriggered: Record<ProactiveTriggerType, number> = {} as any;
let speechLog: ProactiveSpeechEvent[] = [];
const MAX_LOG_SIZE = 200;

// Callback for avatar/TTS output
let onProactiveSpeech: ((message: string, triggerType: ProactiveTriggerType) => void) | null = null;

// ---- Service ----

export const proactiveSpeechService = {
  /** Start listening to eventBus for trigger events */
  start() {
    // Subscribe to mission status changes
    eventBus.on('mission:status_changed', (data: any) => {
      const { status, missionId } = data;
      if (status === 'completed') this._evaluate('mission_completed', missionId);
      if (status === 'failed') this._evaluate('mission_failed', missionId);
      if (status === 'blocked') this._evaluate('mission_blocked', missionId);
    });

    // Subscribe to approval events
    eventBus.on('approval:created', (data: any) => {
      this._evaluate('approval_pending', data.missionId);
    });

    // Budget events
    eventBus.on('ambient:budget_exceeded', () => {
      this._evaluate('budget_cap_hit');
    });

    // Error events (opt-in, off by default)
    eventBus.on('mission:error', (data: any) => {
      this._evaluate('error_occurred', data.missionId);
    });

    logger.info('proactive', 'Proactive speech trigger engine started');
  },

  /** Get all trigger configurations */
  getTriggers(): Record<ProactiveTriggerType, ProactiveTriggerConfig> {
    return { ...triggers };
  },

  /** Update a trigger configuration */
  updateTrigger(type: ProactiveTriggerType, updates: Partial<ProactiveTriggerConfig>): ProactiveTriggerConfig {
    if (!triggers[type]) throw new Error(`Unknown trigger type: ${type}`);
    triggers[type] = { ...triggers[type], ...updates, type };
    logger.info('proactive', `Trigger '${type}' updated: enabled=${triggers[type].enabled}`);
    return triggers[type];
  },

  /** Get quiet hours configuration */
  getQuietHours(): QuietHoursConfig {
    return { ...quietHours };
  },

  /** Update quiet hours configuration */
  updateQuietHours(updates: Partial<QuietHoursConfig>): QuietHoursConfig {
    quietHours = { ...quietHours, ...updates };
    logger.info('proactive', `Quiet hours updated: enabled=${quietHours.enabled}, ${quietHours.start}-${quietHours.end}`);
    return { ...quietHours };
  },

  /** Check if currently in quiet hours */
  isQuietHoursActive(): boolean {
    if (!quietHours.enabled) return false;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (quietHours.start <= quietHours.end) {
      // Same-day range (e.g., 09:00 - 17:00)
      return timeStr >= quietHours.start && timeStr < quietHours.end;
    } else {
      // Overnight range (e.g., 23:00 - 07:00)
      return timeStr >= quietHours.start || timeStr < quietHours.end;
    }
  },

  /** Get proactive speech log */
  getLog(limit: number = 50): ProactiveSpeechEvent[] {
    return speechLog.slice(-limit);
  },

  /** Set callback for when proactive speech should be produced */
  onSpeechCb(cb: (message: string, triggerType: ProactiveTriggerType) => void) {
    onProactiveSpeech = cb;
  },

  // ---- Internal ----

  _evaluate(type: ProactiveTriggerType, missionId?: string) {
    const trigger = triggers[type];
    if (!trigger || !trigger.enabled) return;

    // Check quiet hours
    if (this.isQuietHoursActive()) {
      logger.info('proactive', `Trigger '${type}' suppressed: quiet hours active`);
      return;
    }

    // Check cooldown
    const lastTime = lastTriggered[type] || 0;
    if (Date.now() - lastTime < trigger.cooldownMs) {
      logger.info('proactive', `Trigger '${type}' suppressed: cooldown (${trigger.cooldownMs}ms not elapsed)`);
      return;
    }

    // Trigger the speech
    lastTriggered[type] = Date.now();
    const message = trigger.messageTemplate;

    const event: ProactiveSpeechEvent = {
      id: uuid(),
      triggerType: type,
      message,
      missionId,
      timestamp: new Date(),
    };

    speechLog.push(event);
    if (speechLog.length > MAX_LOG_SIZE) {
      speechLog = speechLog.slice(-MAX_LOG_SIZE);
    }

    // Log as mission_event for auditability
    missionEventService.create({
      missionId: missionId || 'system',
      type: 'proactive_speech',
      payload: event,
    }, 'proactive').catch(() => {});

    logger.info('proactive', `Proactive speech triggered: '${type}' → "${message}"`);

    // Send to avatar/TTS output
    if (onProactiveSpeech) {
      onProactiveSpeech(message, type);
    }
  },
};
