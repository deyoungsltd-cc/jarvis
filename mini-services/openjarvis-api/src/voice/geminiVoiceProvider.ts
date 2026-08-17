/**
 * Phase 5 — Gemini Voice Provider
 * 
 * STT: Uses Gemini's multimodal audio understanding.
 *   Send audio as inline data → model transcribes.
 * 
 * TTS: Not available natively via Gemini API key.
 *   Returns VoiceError with TTS_NOT_SUPPORTED code.
 *   Browser falls back to Web Speech API for TTS.
 */
import { VoiceProvider, VoiceCapability, VoiceInfo, STTResult, TTSResult, VoiceStreamOptions, VoiceError } from './types.js';
import { logger } from '../utils/logger.js';

export class GeminiVoiceProvider implements VoiceProvider {
  readonly name = 'gemini';
  readonly capabilities: VoiceCapability[] = ['stt'];
  
  private client: any;
  private modelName: string;
  private apiKey: string;

  constructor(apiKey: string, modelName?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      this.client = new GoogleGenerativeAI(apiKey);
    } catch {
      throw new VoiceError('PROVIDER_INIT_FAILED', 'Failed to initialize Gemini SDK. Is @google/generative-ai installed?', 'gemini');
    }
  }

  /**
   * STT via Gemini multimodal: send audio as inline data, ask model to transcribe.
   * Supports WAV, MP3, OGG, WEBM formats natively.
   */
  async transcribe(audio: Buffer, options?: VoiceStreamOptions): Promise<STTResult> {
    const startTime = Date.now();
    const language = options?.language || 'en-US';
    
    try {
      const model = this.client.getGenerativeModel({ model: this.modelName });
      
      // Determine MIME type from audio buffer magic bytes
      const mimeType = this.detectMimeType(audio);
      
      const base64Audio = audio.toString('base64');
      
      const prompt = options?.language?.startsWith('zh') 
        ? `请将以下音频内容转写为文字。仅输出转写结果，不要添加任何解释或标点以外的内容。语言：${language}`
        : `Transcribe the following audio exactly as spoken. Output only the transcription, nothing else. Language: ${language}`;
      
      const result = await model.generateContent([
        { inlineData: { mimeType, data: base64Audio } },
        { text: prompt },
      ]);

      const text = result.response.text().trim();
      const durationMs = Date.now() - startTime;

      if (!text) {
        throw new VoiceError('STT_EMPTY_RESULT', 'Gemini returned empty transcription', 'gemini');
      }

      logger.info('voice:stt', `Gemini STT: ${text.substring(0, 80)}${text.length > 80 ? '...' : ''} (${durationMs}ms)`);
      
      return {
        text,
        confidence: 1.0, // Gemini doesn't return confidence scores
        language,
        durationMs,
      };
    } catch (err: any) {
      if (err instanceof VoiceError) throw err;
      
      const msg = err?.message || String(err);
      logger.error('voice:stt', `Gemini STT failed: ${msg}`);
      throw new VoiceError('STT_FAILED', `Gemini transcription failed: ${msg}`, 'gemini');
    }
  }

  /**
   * TTS is not available via Gemini API key.
   * Browser should use Web Speech API (SpeechSynthesis) for TTS.
   */
  async synthesize(_text: string, _options?: VoiceStreamOptions): Promise<TTSResult> {
    throw new VoiceError(
      'TTS_NOT_SUPPORTED',
      'Gemini API does not provide TTS. Use browser SpeechSynthesis or a dedicated TTS provider (e.g. Google Cloud TTS, ElevenLabs).',
      'gemini'
    );
  }

  /**
   * Return a single placeholder voice entry indicating TTS should be
   * handled client-side via browser.
   */
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
   * Detect MIME type from audio buffer magic bytes.
   * Falls back to 'audio/wav' if unrecognized.
   */
  private detectMimeType(audio: Buffer): string {
    if (audio.length < 12) return 'audio/wav';
    
    // RIFF....WAVE
    if (audio[0] === 0x52 && audio[1] === 0x49 && audio[2] === 0x46 && audio[3] === 0x46) {
      return 'audio/wav';
    }
    // ID3 or 0xFF 0xFB (MP3)
    if (audio[0] === 0xFF && (audio[1] & 0xE0) === 0xE0) {
      return 'audio/mp3';
    }
    if (audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) {
      return 'audio/mp3';
    }
    // OggS
    if (audio[0] === 0x4F && audio[1] === 0x67 && audio[2] === 0x67 && audio[3] === 0x53) {
      return 'audio/ogg';
    }
    // WebM (0x1A 0x45 0xDF 0xA3)
    if (audio[0] === 0x1A && audio[1] === 0x45 && audio[2] === 0xDF && audio[3] === 0xA3) {
      return 'audio/webm';
    }
    
    return 'audio/wav';
  }
}