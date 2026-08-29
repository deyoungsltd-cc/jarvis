/**
 * Phase 13 — Gemini Live API Provider
 *
 * Implements the duplex real-time voice conversation via the Gemini Live API
 * (native audio WebSocket). This is NOT the STT→LLM→TTS pipeline from Phase 5;
 * this is the stateful, bidirectional, low-latency speech-to-speech API.
 *
 * Key constraints (verified against 2026-08-18 docs):
 *   - Session length: ~10 minutes (audio-only), resumption token for continuation
 *   - Billed per audio token (~$3/1M input, $12/1M output)
 *   - Native barge-in support via voice activity detection
 *   - Requires GEMINI_API_KEY
 *   - Model family: gemini-2.5-flash-native-audio (confirm at build time)
 */
import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger.js';
import type { AmbientSession, AmbientTranscriptEntry, AudioBudgetConfig } from './types.js';

// Configurable via env vars
const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-05-20';
const DEFAULT_SESSION_CAP_MS = 9.5 * 60 * 1000; // 9.5 min — end before hard 10 min cap
const DEFAULT_IDLE_TIMEOUT_MS = 75 * 1000; // 75 seconds default
const DEFAULT_AUDIO_BUDGET: AudioBudgetConfig = {
  maxSessionTokens: Number(process.env.AMBIENT_MAX_SESSION_TOKENS || '500000'),
  maxDailyTokens: Number(process.env.AMBIENT_MAX_DAILY_TOKENS || '2000000'),
  dailyUsed: 0,
};

export class GeminiLiveProvider {
  private session: AmbientSession | null = null;
  private budget: AudioBudgetConfig = { ...DEFAULT_AUDIO_BUDGET };
  private onTranscript: ((entry: AmbientTranscriptEntry) => void) | null = null;
  private onStateChange: ((state: string) => void) | null = null;
  private onBudgetExceeded: (() => void) | null = null;
  private onResumptionNeeded: ((token: string) => void) | null = null;
  private idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private hardCapTimer: ReturnType<typeof setTimeout> | null = null;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // Reset daily budget at midnight
    this._scheduleDailyBudgetReset();
  }

  /**
   * Start a new Gemini Live session.
   * Opens a WebSocket to the Gemini Live API and configures audio input/output.
   */
  async startSession(options?: {
    missionId?: string;
    idleTimeoutSec?: number;
    resumptionToken?: string;
  }): Promise<AmbientSession> {
    if (this.session && this.session.state === 'live') {
      throw new Error('Ambient session already active');
    }

    if (options?.idleTimeoutSec) {
      this.idleTimeoutMs = options.idleTimeoutSec * 1000;
    }

    const model = GEMINI_LIVE_MODEL;
    // Build the Gemini Live API WebSocket URL
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    const ws = new WebSocket(wsUrl);

    const session: AmbientSession = {
      id: uuid(),
      state: 'waking',
      geminiWs: ws,
      resumptionToken: null,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      idleTimer: null,
      hardCapTimer: null,
      transcript: [],
      budgetUsed: { inputTokens: 0, outputTokens: 0 },
      missionId: options?.missionId,
    };

    this.session = session;

    return new Promise<AmbientSession>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Gemini Live WebSocket connection timeout (10s)'));
      }, 10000);

      ws.onopen = () => {
        clearTimeout(timeout);
        session.state = 'live';

        // Send initial setup message
        // Configure the model and system instructions
        ws.send(JSON.stringify({
          setup: {
            model: model,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: process.env.GEMINI_LIVE_VOICE || 'Aoede',
                  },
                },
              },
            },
            systemInstruction: {
              parts: [{
                text: 'You are JARVIS, a helpful AI assistant. Be concise and conversational. When the user asks you to do something that requires tools or actions, respond naturally and explain what you will do.',
              }],
            },
            tools: [],
          },
        }));

        // If resuming, send the resumption token
        if (options?.resumptionToken) {
          ws.send(JSON.stringify({
            resume: { resumption_token: options.resumptionToken },
          }));
          session.resumptionToken = options.resumptionToken;
        }

        this._startIdleTimer();
        this._startHardCapTimer();
        this._notifyStateChange('live');
        logger.info('ambient:live', `Gemini Live session started: ${session.id}`);
        resolve(session);
      };

      ws.onmessage = (event) => {
        this._handleMessage(event.data);
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        session.state = 'error';
        this._notifyStateChange('error');
        logger.error('ambient:live', `WebSocket error: ${error}`);
      };

      ws.onclose = (event) => {
        clearTimeout(timeout);
        this._cleanup();
        if (session.state !== 'error') {
          logger.info('ambient:live', `Session closed: ${event.code} ${event.reason}`);
        }
      };
    });
  }

  /**
   * Send audio data to the Gemini Live session.
   * Audio should be PCM 16-bit, 16kHz, mono, base64-encoded.
   */
  sendAudio(base64AudioChunk: string) {
    if (!this.session || this.session.state !== 'live' || !this.session.geminiWs) {
      return;
    }

    this._resetIdleTimer();
    this.session.lastActivityAt = new Date();

    try {
      this.session.geminiWs.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            data: base64AudioChunk,
            mimeType: 'audio/pcm;rate=16000',
          }],
        },
      }));
    } catch (err: any) {
      logger.error('ambient:live', `Failed to send audio: ${err.message}`);
    }
  }

  /**
   * Send a text message to the Gemini Live session.
   * Useful for injecting context or system messages.
   */
  sendText(text: string) {
    if (!this.session || this.session.state !== 'live' || !this.session.geminiWs) {
      return;
    }

    this._resetIdleTimer();

    try {
      this.session.geminiWs.send(JSON.stringify({
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ text }],
          }],
        },
      }));
    } catch (err: any) {
      logger.error('ambient:live', `Failed to send text: ${err.message}`);
    }
  }

  /**
   * Interrupt JARVIS's current speech (barge-in).
   * This stops the current audio output and prepares for new input.
   */
  interrupt() {
    if (!this.session || this.session.state !== 'live' || !this.session.geminiWs) {
      return;
    }

    try {
      this.session.geminiWs.send(JSON.stringify({
        interrupt: true,
      }));
      logger.info('ambient:live', 'Barge-in: interrupted JARVIS speech');
    } catch (err: any) {
      logger.error('ambient:live', `Failed to interrupt: ${err.message}`);
    }
  }

  /**
   * Send a vision frame (screenshot/image) to the Gemini Live session.
   * Processes at 1 FPS. No frames are persisted.
   */
  sendVisionFrame(base64Image: string, mimeType: string = 'image/jpeg') {
    if (!this.session || this.session.state !== 'live' || !this.session.geminiWs) {
      return;
    }

    try {
      this.session.geminiWs.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            data: base64Image,
            mimeType,
          }],
        },
      }));
    } catch (err: any) {
      logger.error('ambient:live', `Failed to send vision frame: ${err.message}`);
    }
  }

  /**
   * End the current session.
   * Returns a resumption token if available for continuing the conversation.
   */
  async endSession(): Promise<{ resumptionToken: string | null; sessionDuration: number }> {
    if (!this.session) return { resumptionToken: null, sessionDuration: 0 };

    const duration = Date.now() - this.session.createdAt.getTime();
    const token = this.session.resumptionToken;

    if (this.session.geminiWs) {
      try {
        this.session.geminiWs.close(1000, 'Session ended normally');
      } catch { /* best effort */ }
    }

    this._cleanup();
    return { resumptionToken: token, sessionDuration: duration };
  }

  /** Get the current session (or null) */
  getSession(): AmbientSession | null {
    return this.session;
  }

  /** Get budget info */
  getBudget(): AudioBudgetConfig {
    return { ...this.budget, dailyUsed: this.budget.dailyUsed };
  }

  /** Check if within budget */
  isWithinBudget(): boolean {
    if (!this.session) return true;
    const sessionTotal = this.session.budgetUsed.inputTokens + this.session.budgetUsed.outputTokens;
    return (
      sessionTotal < this.budget.maxSessionTokens &&
      this.budget.dailyUsed < this.budget.maxDailyTokens
    );
  }

  /** Set callbacks */
  onTranscriptCb(cb: (entry: AmbientTranscriptEntry) => void) { this.onTranscript = cb; }
  onStateChangeCb(cb: (state: string) => void) { this.onStateChange = cb; }
  onBudgetExceededCb(cb: () => void) { this.onBudgetExceeded = cb; }
  onResumptionNeededCb(cb: (token: string) => void) { this.onResumptionNeeded = cb; }

  // ---- Private: Message Handling ----

  private _handleMessage(data: string) {
    try {
      const msg = JSON.parse(data);

      // Handle resumption token
      if (msg.resumptionToken) {
        this.session!.resumptionToken = msg.resumptionToken;
        if (this.onResumptionNeeded) {
          this.onResumptionNeeded(msg.resumptionToken);
        }
      }

      // Handle server audio (JARVIS speaking)
      if (msg.serverContent?.modelTurn?.parts) {
        for (const part of msg.serverContent.modelTurn.parts) {
          if (part.inlineData?.mimeType?.startsWith('audio/')) {
            // Emit as agent transcript
            const entry: AmbientTranscriptEntry = {
              id: uuid(),
              timestamp: new Date(),
              direction: 'agent',
              text: '[audio response]',
            };
            this.session!.transcript.push(entry);
            if (this.onTranscript) this.onTranscript(entry);
          }
          // Text parts for transcription of JARVIS's speech
          if (part.text) {
            const entry: AmbientTranscriptEntry = {
              id: uuid(),
              timestamp: new Date(),
              direction: 'agent',
              text: part.text,
            };
            this.session!.transcript.push(entry);
            if (this.onTranscript) this.onTranscript(entry);
          }
        }
      }

      // Handle turn complete
      if (msg.serverContent?.turnComplete) {
        this._startIdleTimer();
      }

      // Handle user transcription (what Gemini heard)
      if (msg.setupComplete) {
        logger.info('ambient:live', 'Gemini Live setup complete');
      }

      // Handle usage/budget info
      if (msg.usageMetadata) {
        this.session!.budgetUsed.inputTokens += msg.usageMetadata.audioInputTokenCount || 0;
        this.session!.budgetUsed.outputTokens += msg.usageMetadata.audioOutputTokenCount || 0;
        this.budget.dailyUsed += (msg.usageMetadata.audioInputTokenCount || 0) + (msg.usageMetadata.audioOutputTokenCount || 0);

        if (!this.isWithinBudget()) {
          logger.warn('ambient:budget', 'Audio budget exceeded');
          if (this.onBudgetExceeded) this.onBudgetExceeded();
        }
      }

    } catch (err: any) {
      logger.error('ambient:live', `Failed to parse Gemini Live message: ${err.message}`);
    }
  }

  // ---- Private: Timers ----

  private _startIdleTimer() {
    this._clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      logger.info('ambient:live', `Idle timeout (${this.idleTimeoutMs}ms) — returning to standby`);
      this._transitionToStandby();
    }, this.idleTimeoutMs);
  }

  private _resetIdleTimer() {
    this._clearIdleTimer();
    this._startIdleTimer();
  }

  private _clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private _startHardCapTimer() {
    if (this.hardCapTimer) clearTimeout(this.hardCapTimer);
    this.hardCapTimer = setTimeout(() => {
      logger.info('ambient:live', 'Hard session cap reached — ending session with resumption token');
      this.endSession();
    }, DEFAULT_SESSION_CAP_MS);
  }

  private async _transitionToStandby() {
    if (!this.session) return;
    const prevState = this.session.state;
    this.session.state = 'idle_rearm';
    this._notifyStateChange('idle_rearm');

    // End the Gemini session but keep the resumption token
    const result = await this.endSession();
    this.session = null;

    this._notifyStateChange('standby');
    logger.info('ambient:live', `Transitioned to standby. Resumption token available: ${!!result.resumptionToken}`);
  }

  private _cleanup() {
    this._clearIdleTimer();
    if (this.hardCapTimer) {
      clearTimeout(this.hardCapTimer);
      this.hardCapTimer = null;
    }
    if (this.session) {
      this.session.state = 'standby';
    }
  }

  private _notifyStateChange(state: string) {
    if (this.onStateChange) this.onStateChange(state);
  }

  private _scheduleDailyBudgetReset() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
      const previous = this.budget.dailyUsed;
      this.budget.dailyUsed = 0;
      logger.info('ambient:budget', `Daily audio budget reset (was ${previous} tokens)`);
      // Reschedule for next midnight
      this._scheduleDailyBudgetReset();
    }, msUntilMidnight);
  }
}
