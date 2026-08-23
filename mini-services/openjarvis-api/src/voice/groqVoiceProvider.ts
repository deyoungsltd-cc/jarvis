/**
 * Phase 5 — Groq Voice Provider
 * 
 * STT: Uses Groq's Whisper (speech-to-text) API.
 *   Fast, accurate transcription supporting 10+ languages.
 * 
 * TTS: Not available via Groq API.
 *   Returns VoiceError with TTS_NOT_SUPPORTED code.
 *   Browser falls back to Web Speech API for TTS.
 */
import { VoiceProvider, VoiceCapability, VoiceInfo, STTResult, TTSResult, VoiceStreamOptions, VoiceError } from './types.js';
import { logger } from '../utils/logger.js';

export class GroqVoiceProvider implements VoiceProvider {
  readonly name = 'groq';
  readonly capabilities: VoiceCapability[] = ['stt'];
  
  private client: any;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    try {
      const Groq = require('groq-sdk').default;
      this.client = new Groq({ apiKey });
    } catch {
      throw new VoiceError('PROVIDER_INIT_FAILED', 'Failed to initialize Groq SDK. Is groq-sdk installed?', 'groq');
    }
  }

  /**
   * STT via Groq Whisper API.
   * Accepts WAV, MP3, OGG, WEBM, FLAC and more.
   */
  async transcribe(audio: Buffer, options?: VoiceStreamOptions): Promise<STTResult> {
    const startTime = Date.now();
    const language = options?.language || 'en';
    
    try {
      // Groq Whisper accepts a File/Blob. We create a File-like object from the buffer.
      // In Node/Bun, we can use the Blob constructor.
      const blob = new Blob([audio as unknown as BlobPart], { type: 'audio/wav' });
      const file = new File([blob], 'audio.wav', { type: 'audio/wav' });

      const response = await this.client.audio.transcriptions.create({
        model: 'whisper-large-v3-turbo',
        file,
        language: this.toGroqLanguageCode(language),
        response_format: 'verbose_json',
      });

      const durationMs = Date.now() - startTime;

      // Groq verbose_json returns: text, language, segments[], duration
      const text = (response as any).text || '';
      const detectedLanguage = (response as any).language || language;
      const audioDuration = (response as any).duration || 0;

      if (!text.trim()) {
        throw new VoiceError('STT_EMPTY_RESULT', 'Groq Whisper returned empty transcription', 'groq');
      }

      logger.info('voice:stt', `Groq STT: ${text.substring(0, 80)}${text.length > 80 ? '...' : ''} (${durationMs}ms)`);

      return {
        text: text.trim(),
        confidence: (response as any).segments?.[0]?.avg_logprob
          ? Math.max(0, Math.min(1, 1 + (response as any).segments[0].avg_logprob))
          : 0.9,
        language: detectedLanguage,
        durationMs: Math.round(audioDuration * 1000) || durationMs,
      };
    } catch (err: any) {
      if (err instanceof VoiceError) throw err;
      
      const msg = err?.message || String(err);
      logger.error('voice:stt', `Groq STT failed: ${msg}`);
      throw new VoiceError('STT_FAILED', `Groq transcription failed: ${msg}`, 'groq');
    }
  }

  /**
   * TTS is not available via Groq API.
   */
  async synthesize(_text: string, _options?: VoiceStreamOptions): Promise<TTSResult> {
    throw new VoiceError(
      'TTS_NOT_SUPPORTED',
      'Groq API does not provide TTS. Use browser SpeechSynthesis or a dedicated TTS provider.',
      'groq'
    );
  }

  async getVoices(): Promise<VoiceInfo[]> {
    return [
      {
        id: 'browser-default',
        name: 'Browser Default (SpeechSynthesis)',
        language: '*',
        gender: 'neutral',
      },
    ];
  }

  /**
   * Convert language codes like 'en-US', 'zh-CN' to Groq format ('en', 'zh').
   */
  private toGroqLanguageCode(code: string): string | undefined {
    // If already a 2-letter code, pass through
    if (/^[a-z]{2}$/i.test(code)) return code.toLowerCase();
    // Extract the primary subtag (e.g. 'en' from 'en-US')
    const match = code.match(/^([a-z]{2})/i);
    return match ? match[1].toLowerCase() : undefined;
  }
}
