/**
 * Phase 14 — Provider Abstraction Types
 *
 * Every capability category has a typed interface.
 * Adapters implement these interfaces.
 * The providerManager handles selection, fallback, and usage tracking.
 */

// ---- Capability Categories ----
export type CapabilityCategory =
  | 'llm'          // Large Language Model
  | 'search'       // Web research
  | 'voice_stt'    // Speech-to-text
  | 'voice_tts'    // Text-to-speech
  | 'ambient_voice' // Real-time duplex voice (Gemini Live)
  | 'wake_word'    // Wake word detection
  | 'avatar';      // Talking head / video avatar

// ---- Base Provider Interface ----
export interface BaseProvider {
  readonly name: string;
  readonly capability: CapabilityCategory;
  readonly isFree: boolean;
  healthCheck(): Promise<ProviderHealthResult>;
}

export interface ProviderHealthResult {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  rateLimited?: boolean;
}

// ---- LLM Provider ----
export interface LLMProvider extends BaseProvider {
  capability: 'llm';
  chat(messages: Array<{role: string; content: string}>, tools?: Array<{name: string; description: string; inputSchema: Record<string, unknown>}>): Promise<LLMResponse>;
}

export interface LLMResponse {
  content: string | null;
  toolCalls: Array<{id: string; name: string; arguments: Record<string, unknown>}>;
  finishReason: 'stop' | 'tool_calls' | 'max_tokens' | 'error';
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// ---- Search Provider ----
export interface SearchProvider extends BaseProvider {
  capability: 'search';
  search(query: string, options?: {numResults?: number}): Promise<SearchResult[]>;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  source?: string; // provider name for provenance
}

// ---- Voice STT Provider ----
export interface VoiceSTTProvider extends BaseProvider {
  capability: 'voice_stt';
  transcribe(audio: Buffer, options?: {language?: string}): Promise<{text: string; confidence?: number; language?: string; durationMs?: number}>;
}

// ---- Voice TTS Provider ----
export interface VoiceTTSProvider extends BaseProvider {
  capability: 'voice_tts';
  synthesize(text: string, options?: {language?: string; voice?: string; speed?: number}): Promise<{audio: Buffer; format: string; sampleRate?: number; durationMs?: number}>;
  getVoices?(): Promise<Array<{id: string; name: string; language?: string}>>;
}

// ---- Ambient Voice Provider ----
export interface AmbientVoiceProvider extends BaseProvider {
  capability: 'ambient_voice';
  createSession?(options?: {model?: string; voice?: string}): Promise<AmbientVoiceSession>;
  sendAudio?(sessionId: string, audio: Buffer): Promise<void>;
  sendText?(sessionId: string, text: string): Promise<void>;
  endSession?(sessionId: string): Promise<{resumeToken?: string}>;
}

export interface AmbientVoiceSession {
  id: string;
  status: 'connecting' | 'connected' | 'listening' | 'speaking' | 'error' | 'ended';
  provider: string;
}

// ---- Wake Word Provider ----
export interface WakeWordProvider extends BaseProvider {
  capability: 'wake_word';
  createDetector?(options?: {keyword?: string; sensitivity?: number}): Promise<WakeWordDetector>;
}

export interface WakeWordDetector {
  processAudio(audio: Buffer): Promise<boolean>; // returns true if wake word detected
  destroy(): void;
}

// ---- Avatar Provider ----
export interface AvatarProvider extends BaseProvider {
  capability: 'avatar';
  createSession?(options?: {avatarId?: string}): Promise<AvatarSession>;
  endSession?(sessionId: string): Promise<void>;
}

export interface AvatarSession {
  id: string;
  status: 'connecting' | 'connected' | 'speaking' | 'error' | 'ended';
  streamUrl?: string; // WebRTC or WebSocket URL for the video stream
  offer?: string; // SDP offer for WebRTC
}

// ---- Provider Result (unified) ----
export interface ProviderResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  provider: string;
  capability: CapabilityCategory;
  durationMs: number;
  fromCache?: boolean;
}

// ---- Fallback Info ----
export interface FallbackEvent {
  capability: CapabilityCategory;
  fromProvider: string;
  toProvider: string;
  reason: string; // "rate_limited" | "error" | "timeout" | "degraded"
  timestamp: Date;
}
