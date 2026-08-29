/**
 * Phase 5 — Voice System Types
 * 
 * Provider-abstracted voice (STT/TTS) following the same pattern as
 * ModelProvider. Swapping voice backends requires zero changes outside
 * the adapter.
 */

// ---- Voice Provider Interface ----

export interface STTResult {
  text: string;
  confidence: number;
  language: string;
  durationMs: number;
}

export interface TTSResult {
  audio: Buffer;
  format: 'mp3' | 'wav' | 'ogg' | 'pcm';
  sampleRate: number;
  durationMs: number;
}

export interface VoiceStreamOptions {
  language?: string;
  /** TTS voice name/ID (provider-specific) */
  voice?: string;
  /** Speech speed (0.25 - 4.0) */
  speed?: number;
  /** Pitch adjustment (-20.0 to 20.0) */
  pitch?: number;
  /** Streaming chunk size in ms for TTS */
  chunkSizeMs?: number;
}

export interface VoiceProvider {
  readonly name: string;
  readonly capabilities: VoiceCapability[];

  /** Speech-to-Text: convert audio buffer to transcript */
  transcribe(audio: Buffer, options?: VoiceStreamOptions): Promise<STTResult>;

  /** Text-to-Speech: convert text to audio buffer */
  synthesize(text: string, options?: VoiceStreamOptions): Promise<TTSResult>;

  /** Get available voices for this provider */
  getVoices(): Promise<VoiceInfo[]>;
}

export type VoiceCapability = 'stt' | 'tts' | 'streaming_stt' | 'streaming_tts';

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female' | 'neutral';
  previewUrl?: string;
}

// ---- Voice Session (for streaming conversations) ----

export type VoiceSessionStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface VoiceSession {
  id: string;
  missionId?: string;
  status: VoiceSessionStatus;
  provider: string;
  language: string;
  voice: string;
  createdAt: Date;
  lastActivityAt: Date;
  transcript: VoiceTranscriptEntry[];
}

export interface VoiceTranscriptEntry {
  id: string;
  timestamp: Date;
  direction: 'user' | 'agent';
  text: string;
  confidence?: number;
  audioDurationMs?: number;
}

// ---- API Types ----

export interface STTRequest {
  /** Base64-encoded audio data */
  audio: string;
  /** Audio format */
  format: 'wav' | 'mp3' | 'ogg' | 'pcm' | 'webm';
  /** Language code (e.g. 'en-US', 'zh-CN') */
  language?: string;
  /** Provider to use (default from config) */
  provider?: string;
}

export interface STTResponse {
  text: string;
  confidence: number;
  language: string;
  durationMs: number;
  provider: string;
}

export interface TTSRequest {
  /** Text to synthesize */
  text: string;
  /** Language code */
  language?: string;
  /** Voice ID/name */
  voice?: string;
  /** Speech speed (0.25 - 4.0) */
  speed?: number;
  /** Pitch adjustment (-20.0 to 20.0) */
  pitch?: number;
  /** Provider to use */
  provider?: string;
}

export interface TTSResponse {
  /** Base64-encoded audio data */
  audio: string;
  format: string;
  sampleRate: number;
  durationMs: number;
  provider: string;
}

export interface VoiceStatusResponse {
  availableProviders: string[];
  activeProvider: string;
  capabilities: VoiceCapability[];
  availableVoices: VoiceInfo[];
}

export interface VoiceSessionCreateRequest {
  missionId?: string;
  provider?: string;
  language?: string;
  voice?: string;
}

// ---- Error types ----

export class VoiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly provider?: string
  ) {
    super(message);
    this.name = 'VoiceError';
  }
}
