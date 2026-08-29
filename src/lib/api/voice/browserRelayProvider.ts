/**
 * Phase 5 — Browser Relay Voice Provider
 * 
 * A server-side voice provider that acknowledges the browser handles
 * both STT and TTS natively via Web Speech API.
 * 
 * Server role: log transcripts, relay to missions, manage sessions.
 * Client role: actual SpeechRecognition + SpeechSynthesis.
 * 
 * STT calls return a placeholder response (real STT happens client-side).
 * TTS calls return a placeholder response (real TTS happens client-side).
 * 
 * This provider is always available and requires no API keys.
 */
import { VoiceProvider, VoiceCapability, VoiceInfo, STTResult, TTSResult, VoiceStreamOptions } from '@/lib/api/types.js';
import { logger } from '@/lib/api/logger';

export class BrowserRelayProvider implements VoiceProvider {
  readonly name = 'browser';
  readonly capabilities: VoiceCapability[] = ['stt', 'tts'];

  /**
   * STT is handled client-side via SpeechRecognition API.
   * Server logs the text that was already transcribed by the browser.
   */
  async transcribe(audio: Buffer, options?: VoiceStreamOptions): Promise<STTResult> {
    // In browser relay mode, audio is typically not sent to the server.
    // The browser sends the already-transcribed text via WebSocket.
    // This method exists for interface compliance only.
    logger.info('voice:stt', 'Browser relay: STT handled client-side, server received audio buffer');
    return {
      text: '',
      confidence: 0,
      language: options?.language || 'en-US',
      durationMs: 0,
    };
  }

  /**
   * TTS is handled client-side via SpeechSynthesis API.
   * This method exists for interface compliance only.
   */
  async synthesize(text: string, options?: VoiceStreamOptions): Promise<TTSResult> {
    logger.info('voice:tts', `Browser relay: TTS handled client-side for "${text.substring(0, 60)}"`);
    // Return an empty PCM buffer as a valid-but-empty TTS result.
    // The browser will handle actual audio synthesis.
    return {
      audio: Buffer.alloc(0),
      format: 'pcm',
      sampleRate: 24000,
      durationMs: 0,
    };
  }

  /**
   * Returns the browser's built-in voices.
   * Since we're server-side, we return a placeholder list.
   * The actual voice list is fetched client-side via speechSynthesis.getVoices().
   */
  async getVoices(): Promise<VoiceInfo[]> {
    return [
      {
        id: 'browser-default',
        name: 'Browser Default',
        language: '*',
        gender: 'neutral',
      },
    ];
  }
}
