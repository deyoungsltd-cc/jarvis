/**
 * Phase 5 — Voice Routes
 * 
 * REST endpoints for voice operations:
 *   GET  /voice/status     — Voice system status + available providers/voices
 *   POST /voice/stt        — Speech-to-text (audio → transcript)
 *   POST /voice/tts        — Text-to-speech (text → audio)
 *   GET  /voice/sessions   — List active voice sessions
 *   POST /voice/sessions   — Create a voice session
 *   GET  /voice/sessions/:id — Get session details + transcript
 *   DELETE /voice/sessions/:id — Delete a voice session
 *   POST /voice/sessions/:id/transcript — Add browser-relayed transcript entry
 */
import { Router, Request, Response } from 'express';
import {
  initVoiceSystem,
  getActiveProvider,
  getActiveProviderName,
  getAvailableProviders,
  setActiveProvider,
  getProvider,
  createVoiceSession,
  getVoiceSession,
  deleteVoiceSession,
  getAllSessions,
  updateSessionStatus,
  addTranscriptEntry,
  processBrowserTranscript,
} from '../voice/voiceManager.js';
import { VoiceError } from '../voice/types.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Initialize voice system on first route load
let initialized = false;
function ensureInit() {
  if (!initialized) {
    initVoiceSystem();
    initialized = true;
  }
}

// ---- GET /voice/status ----
router.get('/status', async (_req: Request, res: Response) => {
  ensureInit();
  try {
    const provider = getActiveProvider();
    const voices = await provider.getVoices();
    
    res.json({
      availableProviders: getAvailableProviders(),
      activeProvider: getActiveProviderName(),
      capabilities: provider.capabilities,
      availableVoices: voices,
    });
  } catch (err: any) {
    res.status(503).json({
      error: {
        code: 'VOICE_UNAVAILABLE',
        message: err.message || 'Voice system not available',
        requestId: (_req as any).requestId || '-',
      },
    });
  }
});

// ---- POST /voice/provider ----
router.post('/provider', async (req: Request, res: Response) => {
  ensureInit();
  const { provider: providerName } = req.body;
  
  if (!providerName || typeof providerName !== 'string') {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body must include "provider" (string)',
        requestId: (_req as any).requestId || '-',
      },
    });
    return;
  }
  
  try {
    setActiveProvider(providerName);
    const provider = getActiveProvider();
    const voices = await provider.getVoices();
    
    res.json({
      switched: true,
      activeProvider: getActiveProviderName(),
      capabilities: provider.capabilities,
      availableVoices: voices,
    });
  } catch (err: any) {
    const code = err instanceof VoiceError ? err.code : 'SWITCH_FAILED';
    res.status(400).json({
      error: { code, message: err.message, requestId: (_req as any).requestId || '-' },
    });
  }
});

// ---- POST /voice/stt ----
router.post('/stt', async (req: Request, res: Response) => {
  ensureInit();
  const { audio, format, language, provider: providerName } = req.body;
  
  // Validate required fields
  if (!audio || typeof audio !== 'string') {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body must include "audio" (base64-encoded string)',
        requestId: (_req as any).requestId || '-',
      },
    });
    return;
  }

  const validFormats = ['wav', 'mp3', 'ogg', 'pcm', 'webm'];
  if (format && !validFormats.includes(format)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid audio format: "${format}". Supported: ${validFormats.join(', ')}`,
        requestId: (_req as any).requestId || '-',
      },
    });
    return;
  }

  // Audio size limit: 10MB base64 ≈ 7.5MB raw
  if (audio.length > 10 * 1024 * 1024) {
    res.status(413).json({
      error: {
        code: 'AUDIO_TOO_LARGE',
        message: 'Audio data exceeds 10MB limit (base64-encoded)',
        requestId: (_req as any).requestId || '-',
      },
    });
    return;
  }

  try {
    const targetProvider = providerName 
      ? getProvider(providerName) || getActiveProvider() 
      : getActiveProvider();
    
    const audioBuffer = Buffer.from(audio, 'base64');
    
    const result = await targetProvider.transcribe(audioBuffer, {
      language: language || 'en-US',
    });
    
    logger.info('voice:stt:api', `STT completed via ${targetProvider.name}: "${result.text.substring(0, 60)}"`);
    
    res.json({
      text: result.text,
      confidence: result.confidence,
      language: result.language,
      durationMs: result.durationMs,
      provider: targetProvider.name,
    });
  } catch (err: any) {
    const code = err instanceof VoiceError ? err.code : 'STT_FAILED';
    const status = code === 'TTS_NOT_SUPPORTED' ? 422 : (code === 'MISSING_API_KEY' ? 503 : 500);
    res.status(status).json({
      error: { code, message: err.message, requestId: (_req as any).requestId || '-' },
    });
  }
});

// ---- POST /voice/tts ----
router.post('/tts', async (req: Request, res: Response) => {
  ensureInit();
  const { text, language, voice, speed, pitch, provider: providerName } = req.body;
  
  if (!text || typeof text !== 'string') {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body must include "text" (string)',
        requestId: (_req as any).requestId || '-',
      },
    });
    return;
  }

  // Text length limit
  if (text.length > 5000) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Text exceeds 5000 character limit for TTS',
        requestId: (_req as any).requestId || '-',
      },
    });
    return;
  }

  try {
    const targetProvider = providerName
      ? getProvider(providerName) || getActiveProvider()
      : getActiveProvider();
    
    const result = await targetProvider.synthesize(text, {
      language: language || 'en-US',
      voice,
      speed: speed ?? 1.0,
      pitch: pitch ?? 0,
    });
    
    res.json({
      audio: result.audio.toString('base64'),
      format: result.format,
      sampleRate: result.sampleRate,
      durationMs: result.durationMs,
      provider: targetProvider.name,
    });
  } catch (err: any) {
    const code = err instanceof VoiceError ? err.code : 'TTS_FAILED';
    const status = code === 'TTS_NOT_SUPPORTED' ? 422 : (code === 'MISSING_API_KEY' ? 503 : 500);
    res.status(status).json({
      error: { code, message: err.message, requestId: (_req as any).requestId || '-' },
    });
  }
});

// ---- GET /voice/sessions ----
router.get('/sessions', async (_req: Request, res: Response) => {
  ensureInit();
  const sessions = getAllSessions();
  res.json(sessions.map(s => ({
    id: s.id,
    missionId: s.missionId,
    status: s.status,
    provider: s.provider,
    language: s.language,
    voice: s.voice,
    createdAt: s.createdAt.toISOString(),
    lastActivityAt: s.lastActivityAt.toISOString(),
    transcriptCount: s.transcript.length,
  })));
});

// ---- POST /voice/sessions ----
router.post('/sessions', async (req: Request, res: Response) => {
  ensureInit();
  const { missionId, provider, language, voice } = req.body;
  
  const session = createVoiceSession({ missionId, provider, language, voice });
  
  res.status(201).json({
    id: session.id,
    missionId: session.missionId,
    status: session.status,
    provider: session.provider,
    language: session.language,
    voice: session.voice,
    createdAt: session.createdAt.toISOString(),
  });
});

// ---- GET /voice/sessions/:id ----
router.get('/sessions/:id', async (req: Request, res: Response) => {
  ensureInit();
  const session = getVoiceSession(req.params.id);
  
  if (!session) {
    res.status(404).json({
      error: {
        code: 'SESSION_NOT_FOUND',
        message: `Voice session "${req.params.id}" not found`,
        requestId: (_req as any).requestId || '-',
      },
    });
    return;
  }
  
  res.json({
    id: session.id,
    missionId: session.missionId,
    status: session.status,
    provider: session.provider,
    language: session.language,
    voice: session.voice,
    createdAt: session.createdAt.toISOString(),
    lastActivityAt: session.lastActivityAt.toISOString(),
    transcript: session.transcript.map(t => ({
      id: t.id,
      timestamp: t.timestamp.toISOString(),
      direction: t.direction,
      text: t.text,
      confidence: t.confidence,
      audioDurationMs: t.audioDurationMs,
    })),
  });
});

// ---- DELETE /voice/sessions/:id ----
router.delete('/sessions/:id', async (req: Request, res: Response) => {
  ensureInit();
  const deleted = deleteVoiceSession(req.params.id);
  
  if (!deleted) {
    res.status(404).json({
      error: {
        code: 'SESSION_NOT_FOUND',
        message: `Voice session "${req.params.id}" not found`,
        requestId: (_req as any).requestId || '-',
      },
    });
    return;
  }
  
  res.json({ deleted: true });
});

// ---- POST /voice/sessions/:id/transcript ----
// For browser-relayed transcripts (client-side STT already done)
router.post('/sessions/:id/transcript', async (req: Request, res: Response) => {
  ensureInit();
  const { text, confidence, direction } = req.body;
  
  if (!text || typeof text !== 'string') {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body must include "text" (string)',
        requestId: (_req as any).requestId || '-',
      },
    });
    return;
  }
  
  const entry = addTranscriptEntry(
    req.params.id,
    direction === 'agent' ? 'agent' : 'user',
    text,
    typeof confidence === 'number' ? confidence : undefined
  );
  
  if (!entry) {
    res.status(404).json({
      error: {
        code: 'SESSION_NOT_FOUND',
        message: `Voice session "${req.params.id}" not found`,
        requestId: (_req as any).requestId || '-',
      },
    });
    return;
  }
  
  res.status(201).json({
    id: entry.id,
    timestamp: entry.timestamp.toISOString(),
    direction: entry.direction,
    text: entry.text,
  });
});

// ---- POST /voice/sessions/:id/status ----
router.post('/sessions/:id/status', async (req: Request, res: Response) => {
  ensureInit();
  const { status } = req.body;
  
  const validStatuses = ['idle', 'listening', 'processing', 'speaking', 'error'];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        requestId: (_req as any).requestId || '-',
      },
    });
    return;
  }
  
  const session = updateSessionStatus(req.params.id, status as any);
  
  if (!session) {
    res.status(404).json({
      error: {
        code: 'SESSION_NOT_FOUND',
        message: `Voice session "${req.params.id}" not found`,
        requestId: (_req as any).requestId || '-',
      },
    });
    return;
  }
  
  res.json({
    id: session.id,
    status: session.status,
    lastActivityAt: session.lastActivityAt.toISOString(),
  });
});

export default router;
