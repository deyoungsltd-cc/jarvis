/**
 * Phase 5 — Voice Manager
 * 
 * Central voice system: provider factory, session management,
 * and coordination between STT/TTS and the agent loop.
 * 
 * Architecture mirrors modelProvider.ts factory pattern:
 *   createVoiceProvider('gemini'|'groq'|'browser') → VoiceProvider
 */
import { VoiceProvider, VoiceInfo, VoiceStreamOptions, VoiceSession, VoiceSessionStatus, VoiceTranscriptEntry, VoiceError, STTResult } from '@/lib/api/types.js';
import { GeminiVoiceProvider } from '@/lib/api/geminiVoiceProvider.js';
import { GroqVoiceProvider } from '@/lib/api/groqVoiceProvider.js';
import { BrowserRelayProvider } from '@/lib/api/browserRelayProvider.js';
import { logger } from '@/lib/api/logger';
import { v4 as uuid } from 'uuid';

// ---- Provider Registry ----

const providers = new Map<string, VoiceProvider>();
let activeProviderName: string = 'browser';

/**
 * Create a voice provider by name.
 * Follows the same factory pattern as createModelProvider().
 */
export function createVoiceProvider(name: string): VoiceProvider {
  switch (name) {
    case 'gemini': {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new VoiceError('MISSING_API_KEY', 'GEMINI_API_KEY not set in environment', 'gemini');
      return new GeminiVoiceProvider(key);
    }
    case 'groq': {
      const key = process.env.GROQ_API_KEY;
      if (!key) throw new VoiceError('MISSING_API_KEY', 'GROQ_API_KEY not set in environment', 'groq');
      return new GroqVoiceProvider(key);
    }
    case 'browser':
      return new BrowserRelayProvider();
    default:
      throw new VoiceError('UNKNOWN_PROVIDER', `Unknown voice provider: ${name}`);
  }
}

/**
 * Initialize the voice system. Called at server startup.
 * Tries to initialize the configured provider, falls back to 'browser'.
 */
export function initVoiceSystem(): void {
  const configuredProvider = process.env.VOICE_PROVIDER || 'browser';
  
  // Always register browser relay (always available, no API key needed)
  const browserProvider = new BrowserRelayProvider();
  providers.set('browser', browserProvider);

  // Try to initialize configured provider
  if (configuredProvider !== 'browser') {
    try {
      const provider = createVoiceProvider(configuredProvider);
      providers.set(configuredProvider, provider);
      activeProviderName = configuredProvider;
      logger.info('voice:init', `Voice provider initialized: ${configuredProvider} (capabilities: ${provider.capabilities.join(', ')})`);
    } catch (err: any) {
      logger.warn('voice:init', `Failed to initialize ${configuredProvider}: ${err.message}. Falling back to browser relay.`);
      activeProviderName = 'browser';
    }
  } else {
    activeProviderName = 'browser';
    logger.info('voice:init', 'Voice provider: browser relay (client-side STT/TTS)');
  }

  // Also try to register Gemini and Groq if keys are available
  if (process.env.GEMINI_API_KEY && !providers.has('gemini')) {
    try {
      providers.set('gemini', createVoiceProvider('gemini'));
      logger.info('voice:init', 'Gemini voice provider available as secondary');
    } catch { /* already logged */ }
  }
  if (process.env.GROQ_API_KEY && !providers.has('groq')) {
    try {
      providers.set('groq', createVoiceProvider('groq'));
      logger.info('voice:init', 'Groq voice provider available as secondary');
    } catch { /* already logged */ }
  }
}

/**
 * Get the currently active voice provider.
 */
export function getActiveProvider(): VoiceProvider {
  const provider = providers.get(activeProviderName);
  if (!provider) {
    throw new VoiceError('NO_ACTIVE_PROVIDER', `Active provider '${activeProviderName}' not initialized`);
  }
  return provider;
}

/**
 * Get a specific provider by name.
 */
export function getProvider(name: string): VoiceProvider | undefined {
  return providers.get(name);
}

/**
 * Get all registered provider names.
 */
export function getAvailableProviders(): string[] {
  return Array.from(providers.keys());
}

/**
 * Switch the active voice provider.
 */
export function setActiveProvider(name: string): void {
  if (!providers.has(name)) {
    throw new VoiceError('UNKNOWN_PROVIDER', `Provider '${name}' is not registered. Available: ${getAvailableProviders().join(', ')}`);
  }
  activeProviderName = name;
  logger.info('voice:switch', `Active voice provider switched to: ${name}`);
}

/**
 * Get the name of the active provider.
 */
export function getActiveProviderName(): string {
  return activeProviderName;
}

// ---- Voice Session Management ----

const sessions = new Map<string, VoiceSession>();

/**
 * Create a new voice session for streaming conversation.
 */
export function createVoiceSession(opts?: {
  missionId?: string;
  provider?: string;
  language?: string;
  voice?: string;
}): VoiceSession {
  const session: VoiceSession = {
    id: uuid(),
    missionId: opts?.missionId,
    status: 'idle',
    provider: opts?.provider || activeProviderName,
    language: opts?.language || 'en-US',
    voice: opts?.voice || 'browser-default',
    createdAt: new Date(),
    lastActivityAt: new Date(),
    transcript: [],
  };
  sessions.set(session.id, session);
  logger.info('voice:session', `Voice session created: ${session.id} (provider: ${session.provider})`);
  return session;
}

/**
 * Get a voice session by ID.
 */
export function getVoiceSession(sessionId: string): VoiceSession | undefined {
  return sessions.get(sessionId);
}

/**
 * Update session status.
 */
export function updateSessionStatus(sessionId: string, status: VoiceSessionStatus): VoiceSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  
  // Validate transitions
  const validTransitions: Record<VoiceSessionStatus, VoiceSessionStatus[]> = {
    idle: ['listening', 'error'],
    listening: ['processing', 'idle', 'error'],
    processing: ['speaking', 'idle', 'error'],
    speaking: ['idle', 'listening', 'error'],
    error: ['idle'],
  };
  
  const allowed = validTransitions[session.status];
  if (!allowed.includes(status)) {
    logger.warn('voice:session', `Invalid session transition: ${session.status} → ${status}`);
    return session;
  }
  
  session.status = status;
  session.lastActivityAt = new Date();
  return session;
}

/**
 * Add a transcript entry to a voice session.
 */
export function addTranscriptEntry(
  sessionId: string,
  direction: 'user' | 'agent',
  text: string,
  confidence?: number,
  audioDurationMs?: number
): VoiceTranscriptEntry | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  
  const entry: VoiceTranscriptEntry = {
    id: uuid(),
    timestamp: new Date(),
    direction,
    text,
    confidence,
    audioDurationMs,
  };
  
  session.transcript.push(entry);
  session.lastActivityAt = new Date();
  return entry;
}

/**
 * Delete a voice session.
 */
export function deleteVoiceSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * Get all active voice sessions.
 */
export function getAllSessions(): VoiceSession[] {
  return Array.from(sessions.values());
}

// ---- Voice-Aware Agent Integration ----

/**
 * Process a voice transcript as a mission input.
 * Transcribes audio, creates/updates a mission with the text goal.
 * This bridges voice input → agent loop.
 */
export async function processVoiceInput(
  audio: Buffer,
  options?: VoiceStreamOptions & { missionId?: string; provider?: string }
): Promise<{ text: string; provider: string; sessionId?: string }> {
  const providerName = options?.provider || activeProviderName;
  const provider = getProvider(providerName);
  
  if (!provider) {
    throw new VoiceError('UNKNOWN_PROVIDER', `Provider '${providerName}' not available`);
  }
  
  if (!provider.capabilities.includes('stt')) {
    throw new VoiceError('STT_NOT_SUPPORTED', `Provider '${providerName}' does not support STT`);
  }

  const result: STTResult = await provider.transcribe(audio, options);
  
  return {
    text: result.text,
    provider: providerName,
  };
}

/**
 * Process a browser-relayed transcript (text already transcribed client-side).
 * Validates and logs the transcript for mission context.
 */
export function processBrowserTranscript(
  sessionId: string,
  text: string,
  confidence?: number
): VoiceTranscriptEntry | undefined {
  if (!text.trim()) {
    throw new VoiceError('STT_EMPTY_RESULT', 'Browser transcript is empty');
  }
  
  return addTranscriptEntry(sessionId, 'user', text.trim(), confidence);
}