/**
 * Phase 13 — Wake Word Detection Service
 *
 * Backend service for wake word configuration and state management.
 * Actual wake word detection runs client-side via Porcupine Web SDK
 * or openWakeWord. This service manages the server-side state:
 *   - Which wake word engine is configured
 *   - Whether the wake word listener is currently active
 *   - Required COOP/COEP header verification
 *   - Wake word event logging
 *
 * Wake word detection never sends raw audio to any API.
 * Audio is processed entirely on-device in the browser.
 * Only after the wake word fires does the system start streaming
 * audio to the Gemini Live API.
 */
import { logger } from '../utils/logger.js';
import type { WakeWordEngine, WakeWordEvent } from './types.js';

// ---- Configuration ----

interface WakeWordConfig {
  engine: WakeWordEngine | null;  // null = disabled
  keyword: string;                  // 'jarvis' (Porcupine built-in) or custom
  sensitivity: number;              // 0.0 - 1.0 (default: 0.5)
  /** Minimum confidence to trigger (filter false positives) */
  minConfidence: number;
  /** Porcupine AccessKey (if using Porcupine) */
  porcupineAccessKey: string | null;
}

// ---- Singleton State ----

const defaultConfig: WakeWordConfig = {
  engine: null, // Disabled by default
  keyword: 'jarvis',
  sensitivity: 0.5,
  minConfidence: 0.6,
  porcupineAccessKey: process.env.PORCUPINE_ACCESS_KEY || null,
};

let config: WakeWordConfig = { ...defaultConfig };
let isListening = false;
let wakeWordLog: WakeWordEvent[] = [];
const MAX_LOG_SIZE = 100;

// ---- Service ----

export const wakeWordService = {
  /** Get current wake word configuration */
  getConfig(): WakeWordConfig {
    return { ...config };
  },

  /** Update wake word configuration */
  updateConfig(updates: Partial<WakeWordConfig>): WakeWordConfig {
    if (updates.engine !== undefined) {
      // Validate engine
      if (updates.engine !== null && updates.engine !== 'porcupine' && updates.engine !== 'openwake') {
        throw new Error(`Invalid wake word engine: ${updates.engine}. Must be 'porcupine', 'openwake', or null.`);
      }
      config.engine = updates.engine;
    }
    if (updates.keyword !== undefined) config.keyword = updates.keyword;
    if (updates.sensitivity !== undefined) {
      config.sensitivity = Math.max(0, Math.min(1, updates.sensitivity));
    }
    if (updates.minConfidence !== undefined) {
      config.minConfidence = Math.max(0, Math.min(1, updates.minConfidence));
    }
    if (updates.porcupineAccessKey !== undefined) {
      config.porcupineAccessKey = updates.porcupineAccessKey;
    }

    logger.info('wakeword', `Config updated: engine=${config.engine}, keyword="${config.keyword}", sensitivity=${config.sensitivity}`);
    return this.getConfig();
  },

  /** Start wake word listening (client confirms it's running) */
  startListening(): { listening: boolean; engine: WakeWordEngine | null } {
    if (!config.engine) {
      throw new Error('No wake word engine configured. Set WAKE_WORD_ENGINE to porcupine or openwake.');
    }
    if (config.engine === 'porcupine' && !config.porcupineAccessKey) {
      throw new Error('Porcupine AccessKey required. Set PORCUPINE_ACCESS_KEY env var or update config.');
    }
    isListening = true;
    logger.info('wakeword', `Wake word listening started: engine=${config.engine}, keyword="${config.keyword}"`);
    return { listening: true, engine: config.engine };
  },

  /** Stop wake word listening */
  stopListening(): { listening: boolean } {
    isListening = false;
    logger.info('wakeword', 'Wake word listening stopped');
    return { listening: false };
  },

  /** Check if currently listening */
  isListening(): boolean {
    return isListening;
  },

  /**
   * Record a wake word detection event from the client.
   * The client sends this when the wake word fires.
   * The server validates confidence and logs it.
   */
  recordDetection(event: { keyword: string; confidence: number }): WakeWordEvent {
    const wakeEvent: WakeWordEvent = {
      detected: event.confidence >= config.minConfidence,
      keyword: event.keyword,
      confidence: event.confidence,
      timestamp: new Date(),
    };

    // Log all detections (including low-confidence ones)
    wakeWordLog.push(wakeEvent);
    if (wakeWordLog.length > MAX_LOG_SIZE) {
      wakeWordLog = wakeWordLog.slice(-MAX_LOG_SIZE);
    }

    if (wakeEvent.detected) {
      logger.info('wakeword', `WAKE WORD DETECTED: "${event.keyword}" (confidence: ${event.confidence.toFixed(3)})`);
    } else {
      logger.info('wakeword', `Wake word near-miss rejected: "${event.keyword}" (confidence: ${event.confidence.toFixed(3)} < ${config.minConfidence})`);
    }

    return wakeEvent;
  },

  /** Get wake word detection log */
  getLog(limit: number = 20): WakeWordEvent[] {
    return wakeWordLog.slice(-limit);
  },

  /** Get COOP/COEP header requirements for client */
  getHeaderRequirements(): {
    required: boolean;
    crossOriginOpenerPolicy: string;
    crossOriginEmbedderPolicy: string;
    reason: string;
  } {
    const needsSharedArrayBuffer = config.engine === 'porcupine';
    return {
      required: needsSharedArrayBuffer,
      crossOriginOpenerPolicy: needsSharedArrayBuffer ? 'same-origin' : '',
      crossOriginEmbedderPolicy: needsSharedArrayBuffer ? 'require-corp' : '',
      reason: needsSharedArrayBuffer
        ? 'Porcupine Web SDK requires SharedArrayBuffer, which needs COOP/COEP headers set by the server.'
        : 'No special headers required for this wake word engine.',
    };
  },
};
