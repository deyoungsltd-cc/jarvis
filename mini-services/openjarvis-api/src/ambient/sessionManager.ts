/**
 * Phase 13 — Ambient Session Manager
 *
 * Coordinates wake word → Gemini Live → idle re-arm lifecycle.
 * This is the central orchestrator for Phase 13's ambient presence.
 */
import { v4 as uuid } from 'uuid';
import { GeminiLiveProvider } from './geminiLiveProvider.js';
import { wakeWordService } from './wakeWordService.js';
import { proactiveSpeechService } from '../proactive/proactiveSpeechService.js';
import { avatarService } from '../avatar/avatarService.js';
import { eventBus } from '../utils/eventBus.js';
import { missionService } from '../services/missionService.js';
import { missionEventService } from '../services/missionEventService.js';
import { logger } from '../utils/logger.js';
import type {
  AmbientSession,
  AmbientSessionState,
  VisionConfig,
  AmbientStartRequest,
} from './types.js';

// ---- State ----

let liveProvider: GeminiLiveProvider | null = null;
let visionConfig: VisionConfig = { enabled: false, fps: 1, persistFrames: false };
let resumptionToken: string | null = null;
let visionInterval: ReturnType<typeof setInterval> | null = null;

// ---- Lifecycle ----

/**
 * Called when the wake word fires. Transitions from standby to live.
 */
async function onWakeWordDetected(): Promise<AmbientSession | null> {
  if (!liveProvider) {
    logger.warn('ambient', 'Wake word detected but no Gemini Live provider available');
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error('ambient', 'GEMINI_API_KEY not set — cannot start ambient session');
    return null;
  }

  try {
    eventBus.emit('ambient:state_change', { state: 'waking' });

    const session = await liveProvider.startSession({
      resumptionToken: resumptionToken || undefined,
    });

    // Start vision if enabled
    if (visionConfig.enabled) {
      startVisionStream();
    }

    eventBus.emit('ambient:state_change', { state: 'live' });
    logger.info('ambient', `Ambient session started from wake word: ${session.id}`);

    return session;
  } catch (err: any) {
    logger.error('ambient', `Failed to start ambient session: ${err.message}`);
    eventBus.emit('ambient:state_change', { state: 'error' });
    return null;
  }
}

/**
 * Called when idle timeout fires or hard cap is reached.
 * Ends the Gemini Live session and returns to wake-word-only standby.
 */
async function onIdleRearm() {
  if (!liveProvider) return;

  const result = await liveProvider.endSession();
  resumptionToken = result.resumptionToken;

  // Stop vision if running
  stopVisionStream();

  eventBus.emit('ambient:state_change', { state: 'standby' });
  logger.info('ambient', 'Returned to standby. Resumption token: ' + (resumptionToken ? 'available' : 'none'));
}

/**
 * Called when the user explicitly requests to start an ambient session
 * (e.g., from the UI, not via wake word).
 */
async function startAmbientSession(request: AmbientStartRequest = {}): Promise<AmbientSession | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set — ambient voice requires Gemini Live API');
  }

  if (!liveProvider) {
    liveProvider = new GeminiLiveProvider(apiKey);

    // Wire up callbacks
    liveProvider.onTranscriptCb((entry) => {
      eventBus.emit('ambient:transcript', entry);
    });

    liveProvider.onStateChangeCb((state) => {
      eventBus.emit('ambient:state_change', { state });
      if (state === 'standby') {
        onIdleRearm();
      }
    });

    liveProvider.onBudgetExceededCb(() => {
      eventBus.emit('ambient:budget_exceeded', {});
    });

    liveProvider.onResumptionNeededCb((token) => {
      resumptionToken = token;
      logger.info('ambient', 'New resumption token received');
    });
  }

  return onWakeWordDetected();
}

/** Manually end the ambient session */
async function endAmbientSession() {
  if (!liveProvider) return;
  stopVisionStream();
  const result = await liveProvider.endSession();
  resumptionToken = result.resumptionToken;
  eventBus.emit('ambient:state_change', { state: 'standby' });
}

// ---- Vision ----

function startVisionStream() {
  if (visionInterval) return;
  // Vision frames are sent from the frontend via WebSocket
  logger.info('ambient:vision', 'Vision stream active (frames sent from client at 1 FPS)');
}

function stopVisionStream() {
  if (visionInterval) {
    clearInterval(visionInterval);
    visionInterval = null;
  }
  logger.info('ambient:vision', 'Vision stream stopped');
}

// ---- Vision Config ----

function updateVisionConfig(updates: Partial<VisionConfig>): VisionConfig {
  if (updates.enabled !== undefined) {
    visionConfig.enabled = updates.enabled;
    if (!updates.enabled) stopVisionStream();
  }
  if (updates.fps !== undefined) visionConfig.fps = Math.max(0.5, Math.min(updates.fps, 5));
  if (updates.persistFrames !== undefined) visionConfig.persistFrames = updates.persistFrames;
  return { ...visionConfig };
}

// ---- Status ----

function getStatus() {
  return {
    state: (liveProvider?.getSession()?.state || 'standby') as AmbientSessionState,
    hasActiveSession: liveProvider?.getSession()?.state === 'live',
    sessionId: liveProvider?.getSession()?.id,
    budgetUsed: liveProvider?.getBudget(),
    wakeWordEngine: wakeWordService.getConfig().engine,
    isWakeWordActive: wakeWordService.isListening(),
    visionEnabled: visionConfig.enabled,
    avatarState: avatarService.getSession()?.state || 'disconnected',
    quietHoursActive: proactiveSpeechService.isQuietHoursActive(),
    resumptionTokenAvailable: !!resumptionToken,
  };
}

// ---- Export ----

export const ambientSessionManager = {
  onWakeWordDetected,
  startAmbientSession,
  endAmbientSession,
  getStatus,
  updateVisionConfig,
  getVisionConfig: () => ({ ...visionConfig }),
  /** Get the live provider (for direct audio send — used by WebSocket relay) */
  getLiveProvider: () => liveProvider,
};
