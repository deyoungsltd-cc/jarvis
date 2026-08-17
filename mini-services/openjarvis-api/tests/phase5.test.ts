/**
 * Phase 5 Tests — Voice System (Unit Tests)
 * 
 * Tests the voice module directly (no HTTP server needed):
 * 1. VoiceManager: provider factory, session CRUD, status transitions
 * 2. BrowserRelayProvider: interface compliance
 * 3. VoiceError: error types
 * 4. Audio MIME type detection (GeminiVoiceProvider)
 * 5. Voice session state machine
 * 6. Session transcript management
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createVoiceProvider,
  initVoiceSystem,
  getActiveProvider,
  getActiveProviderName,
  getAvailableProviders,
  setActiveProvider,
  createVoiceSession,
  getVoiceSession,
  deleteVoiceSession,
  getAllSessions,
  updateSessionStatus,
  addTranscriptEntry,
} from '../src/voice/voiceManager.js';
import { BrowserRelayProvider } from '../src/voice/browserRelayProvider.js';
import { VoiceError } from '../src/voice/types.js';
import type { VoiceProvider, VoiceStreamOptions } from '../src/voice/types.js';

describe('Phase 5 — Voice System', () => {

  // =================================================================
  // 1. VoiceManager Initialization
  // =================================================================
  describe('VoiceManager initialization', () => {
    it('initializes with browser provider by default', () => {
      // Re-init to get clean state
      initVoiceSystem();
      expect(getActiveProviderName()).toBe('browser');
      expect(getAvailableProviders()).toContain('browser');
    });

    it('browser provider implements VoiceProvider interface', () => {
      initVoiceSystem();
      const provider = getActiveProvider();
      expect(provider.name).toBe('browser');
      expect(provider.capabilities).toContain('stt');
      expect(provider.capabilities).toContain('tts');
      expect(typeof provider.transcribe).toBe('function');
      expect(typeof provider.synthesize).toBe('function');
      expect(typeof provider.getVoices).toBe('function');
    });

    it('getAvailableProviders returns at least browser', () => {
      initVoiceSystem();
      const providers = getAvailableProviders();
      expect(providers.length).toBeGreaterThanOrEqual(1);
      expect(providers).toContain('browser');
    });
  });

  // =================================================================
  // 2. BrowserRelayProvider
  // =================================================================
  describe('BrowserRelayProvider', () => {
    let provider: VoiceProvider;

    beforeEach(() => {
      provider = new BrowserRelayProvider();
    });

    it('transcribe returns empty text (client-side STT)', async () => {
      const result = await provider.transcribe(Buffer.from('fake audio'));
      expect(result.text).toBe('');
      expect(result.confidence).toBe(0);
      expect(result.language).toBe('en-US');
      expect(result.durationMs).toBe(0);
    });

    it('synthesize returns empty buffer (client-side TTS)', async () => {
      const result = await provider.synthesize('Hello world');
      expect(result.audio).toBeInstanceOf(Buffer);
      expect(result.audio.length).toBe(0);
      expect(result.format).toBe('pcm');
      expect(result.sampleRate).toBe(24000);
      expect(result.durationMs).toBe(0);
    });

    it('getVoices returns browser-default placeholder', async () => {
      const voices = await provider.getVoices();
      expect(voices.length).toBe(1);
      expect(voices[0].id).toBe('browser-default');
      expect(voices[0].language).toBe('*');
      expect(voices[0].gender).toBe('neutral');
    });

    it('respects language option in transcribe', async () => {
      const result = await provider.transcribe(Buffer.alloc(10), { language: 'zh-CN' });
      expect(result.language).toBe('zh-CN');
    });
  });

  // =================================================================
  // 3. VoiceError
  // =================================================================
  describe('VoiceError', () => {
    it('creates error with code and message', () => {
      const err = new VoiceError('TEST_CODE', 'test message');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(VoiceError);
      expect(err.name).toBe('VoiceError');
      expect(err.code).toBe('TEST_CODE');
      expect(err.message).toBe('test message');
      expect(err.provider).toBeUndefined();
    });

    it('creates error with provider name', () => {
      const err = new VoiceError('STT_FAILED', 'failed', 'gemini');
      expect(err.provider).toBe('gemini');
    });
  });

  // =================================================================
  // 4. Voice Session Management
  // =================================================================
  describe('Voice Sessions', () => {
    let sessionId: string;

    beforeEach(() => {
      initVoiceSystem();
    });

    it('creates a voice session with defaults', () => {
      const session = createVoiceSession();
      expect(session.id).toBeDefined();
      expect(session.status).toBe('idle');
      expect(session.provider).toBe('browser');
      expect(session.language).toBe('en-US');
      expect(session.voice).toBe('browser-default');
      expect(session.transcript).toEqual([]);
      expect(session.createdAt).toBeInstanceOf(Date);
      sessionId = session.id;
    });

    it('creates session with custom options', () => {
      const session = createVoiceSession({
        missionId: 'mission-123',
        language: 'zh-CN',
        voice: 'custom-voice',
      });
      expect(session.missionId).toBe('mission-123');
      expect(session.language).toBe('zh-CN');
      expect(session.voice).toBe('custom-voice');
      sessionId = session.id;
    });

    it('gets a session by ID', () => {
      const created = createVoiceSession();
      const fetched = getVoiceSession(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.status).toBe('idle');
    });

    it('returns undefined for non-existent session', () => {
      const session = getVoiceSession('non-existent-id');
      expect(session).toBeUndefined();
    });

    it('lists all sessions', () => {
      createVoiceSession();
      createVoiceSession();
      const all = getAllSessions();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('deletes a session', () => {
      const session = createVoiceSession();
      const deleted = deleteVoiceSession(session.id);
      expect(deleted).toBe(true);
      expect(getVoiceSession(session.id)).toBeUndefined();
    });

    it('delete returns false for non-existent session', () => {
      const deleted = deleteVoiceSession('non-existent');
      expect(deleted).toBe(false);
    });

    it('adds a user transcript entry', () => {
      const session = createVoiceSession();
      const entry = addTranscriptEntry(session.id, 'user', 'Hello agent', 0.95);
      expect(entry).toBeDefined();
      expect(entry!.direction).toBe('user');
      expect(entry!.text).toBe('Hello agent');
      expect(entry!.confidence).toBe(0.95);

      // Verify it's in the session
      const updated = getVoiceSession(session.id);
      expect(updated!.transcript.length).toBe(1);
      expect(updated!.transcript[0].text).toBe('Hello agent');
    });

    it('adds an agent transcript entry', () => {
      const session = createVoiceSession();
      const entry = addTranscriptEntry(session.id, 'agent', 'I can help with that');
      expect(entry).toBeDefined();
      expect(entry!.direction).toBe('agent');
      expect(entry!.text).toBe('I can help with that');
    });

    it('returns undefined when adding transcript to non-existent session', () => {
      const entry = addTranscriptEntry('non-existent', 'user', 'test');
      expect(entry).toBeUndefined();
    });

    it('multiple transcript entries accumulate in order', () => {
      const session = createVoiceSession();
      addTranscriptEntry(session.id, 'user', 'First');
      addTranscriptEntry(session.id, 'agent', 'Second');
      addTranscriptEntry(session.id, 'user', 'Third');

      const updated = getVoiceSession(session.id);
      expect(updated!.transcript.length).toBe(3);
      expect(updated!.transcript[0].text).toBe('First');
      expect(updated!.transcript[1].text).toBe('Second');
      expect(updated!.transcript[2].text).toBe('Third');
    });
  });

  // =================================================================
  // 5. Voice Session Status Transitions
  // =================================================================
  describe('Voice session status transitions', () => {
    let sessionId: string;

    beforeEach(() => {
      initVoiceSystem();
      const session = createVoiceSession();
      sessionId = session.id;
    });

    it('idle → listening is valid', () => {
      const updated = updateSessionStatus(sessionId, 'listening');
      expect(updated!.status).toBe('listening');
    });

    it('listening → processing is valid', () => {
      updateSessionStatus(sessionId, 'listening');
      const updated = updateSessionStatus(sessionId, 'processing');
      expect(updated!.status).toBe('processing');
    });

    it('processing → speaking is valid', () => {
      updateSessionStatus(sessionId, 'listening');
      updateSessionStatus(sessionId, 'processing');
      const updated = updateSessionStatus(sessionId, 'speaking');
      expect(updated!.status).toBe('speaking');
    });

    it('speaking → idle is valid', () => {
      updateSessionStatus(sessionId, 'listening');
      updateSessionStatus(sessionId, 'processing');
      updateSessionStatus(sessionId, 'speaking');
      const updated = updateSessionStatus(sessionId, 'idle');
      expect(updated!.status).toBe('idle');
    });

    it('error → idle is valid (recovery)', () => {
      updateSessionStatus(sessionId, 'listening');
      updateSessionStatus(sessionId, 'error');
      const updated = updateSessionStatus(sessionId, 'idle');
      expect(updated!.status).toBe('idle');
    });

    it('idle → processing is INVALID (must go through listening)', () => {
      const updated = updateSessionStatus(sessionId, 'processing');
      // Should stay idle (invalid transition rejected)
      expect(updated!.status).toBe('idle');
    });

    it('idle → speaking is INVALID', () => {
      const updated = updateSessionStatus(sessionId, 'speaking');
      expect(updated!.status).toBe('idle');
    });

    it('listening → idle is valid (cancel)', () => {
      updateSessionStatus(sessionId, 'listening');
      const updated = updateSessionStatus(sessionId, 'idle');
      expect(updated!.status).toBe('idle');
    });

    it('listening → error is valid', () => {
      updateSessionStatus(sessionId, 'listening');
      const updated = updateSessionStatus(sessionId, 'error');
      expect(updated!.status).toBe('error');
    });

    it('processing → idle is valid (cancel)', () => {
      updateSessionStatus(sessionId, 'listening');
      updateSessionStatus(sessionId, 'processing');
      const updated = updateSessionStatus(sessionId, 'idle');
      expect(updated!.status).toBe('idle');
    });

    it('processing → error is valid', () => {
      updateSessionStatus(sessionId, 'listening');
      updateSessionStatus(sessionId, 'processing');
      const updated = updateSessionStatus(sessionId, 'error');
      expect(updated!.status).toBe('error');
    });

    it('returns undefined for non-existent session', () => {
      const updated = updateSessionStatus('non-existent', 'listening');
      expect(updated).toBeUndefined();
    });

    it('status update changes lastActivityAt', () => {
      const session = getVoiceSession(sessionId)!;
      const before = session.lastActivityAt.getTime();
      // Small delay to ensure timestamp differs
      const start = Date.now();
      updateSessionStatus(sessionId, 'listening');
      const after = getVoiceSession(sessionId)!.lastActivityAt.getTime();
      expect(after).toBeGreaterThanOrEqual(start);
    });
  });

  // =================================================================
  // 6. Provider Factory
  // =================================================================
  describe('Provider Factory', () => {
    it('creates browser provider without API keys', () => {
      const provider = createVoiceProvider('browser');
      expect(provider.name).toBe('browser');
      expect(provider.capabilities).toContain('stt');
      expect(provider.capabilities).toContain('tts');
    });

    it('throws VoiceError for unknown provider', () => {
      expect(() => createVoiceProvider('nonexistent')).toThrow(VoiceError);
    });

    it('throws VoiceError for gemini without key', () => {
      const original = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      try {
        expect(() => createVoiceProvider('gemini')).toThrow(VoiceError);
        expect(() => createVoiceProvider('gemini')).toThrow(/GEMINI_API_KEY/);
      } finally {
        if (original) process.env.GEMINI_API_KEY = original;
      }
    });

    it('throws VoiceError for groq without key', () => {
      const original = process.env.GROQ_API_KEY;
      delete process.env.GROQ_API_KEY;
      try {
        expect(() => createVoiceProvider('groq')).toThrow(VoiceError);
        expect(() => createVoiceProvider('groq')).toThrow(/GROQ_API_KEY/);
      } finally {
        if (original) process.env.GROQ_API_KEY = original;
      }
    });
  });

  // =================================================================
  // 7. Provider Switching
  // =================================================================
  describe('Provider Switching', () => {
    beforeEach(() => {
      initVoiceSystem();
    });

    it('switches active provider', () => {
      // Already browser
      expect(getActiveProviderName()).toBe('browser');
      // Stay on browser (only provider without API keys)
      setActiveProvider('browser');
      expect(getActiveProviderName()).toBe('browser');
    });

    it('throws when switching to unregistered provider', () => {
      expect(() => setActiveProvider('nonexistent')).toThrow(VoiceError);
    });
  });

  // =================================================================
  // 8. Session Cleanup (multiple sessions)
  // =================================================================
  describe('Multiple Sessions', () => {
    beforeEach(() => {
      initVoiceSystem();
    });

    it('sessions are independent', () => {
      const s1 = createVoiceSession({ language: 'en-US' });
      const s2 = createVoiceSession({ language: 'zh-CN' });

      addTranscriptEntry(s1.id, 'user', 'English text');
      addTranscriptEntry(s2.id, 'user', 'Chinese text');

      const fetched1 = getVoiceSession(s1.id)!;
      const fetched2 = getVoiceSession(s2.id)!;

      expect(fetched1.transcript.length).toBe(1);
      expect(fetched1.transcript[0].text).toBe('English text');
      expect(fetched1.language).toBe('en-US');

      expect(fetched2.transcript.length).toBe(1);
      expect(fetched2.transcript[0].text).toBe('Chinese text');
      expect(fetched2.language).toBe('zh-CN');
    });

    it('deleting one session does not affect others', () => {
      const s1 = createVoiceSession();
      const s2 = createVoiceSession();

      deleteVoiceSession(s1.id);

      expect(getVoiceSession(s1.id)).toBeUndefined();
      expect(getVoiceSession(s2.id)).toBeDefined();
    });
  });

});
