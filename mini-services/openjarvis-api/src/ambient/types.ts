/**
 * Phase 13 — Ambient Voice System Types
 *
 * Types for the Gemini Live API integration, wake word detection,
 * and session lifecycle management.
 */

// ---- Module marker (runtime) ----
// This file primarily exports TypeScript types, which are erased at runtime.
// This marker allows runtime imports to verify the module loaded.
export const AMBIENT_TYPES_VERSION = '1.0.0';

// ---- Ambient Session States ----

export type AmbientSessionState = 'standby' | 'waking' | 'live' | 'idle_rearm' | 'error';

/**
 * A full ambient voice session backed by the Gemini Live API.
 * Manages the duplex WebSocket, idle timer, and budget tracking.
 */
export interface AmbientSession {
  id: string;
  state: AmbientSessionState;
  geminiWs: WebSocket | null;
  resumptionToken: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  idleTimer: ReturnType<typeof setTimeout> | null;
  hardCapTimer: ReturnType<typeof setTimeout> | null;
  transcript: AmbientTranscriptEntry[];
  budgetUsed: { inputTokens: number; outputTokens: number };
  missionId?: string;
}

export interface AmbientTranscriptEntry {
  id: string;
  timestamp: Date;
  direction: 'user' | 'agent';
  text: string;
  isInterrupted?: boolean;
}

// ---- Wake Word Detection ----

export interface WakeWordEvent {
  detected: boolean;
  keyword: string;
  confidence: number;
  timestamp: Date;
}

export type WakeWordEngine = 'porcupine' | 'openwake';

// ---- Proactive Speech Triggers ----

export type ProactiveTriggerType =
  | 'mission_completed'
  | 'mission_failed'
  | 'mission_blocked'
  | 'approval_pending'
  | 'budget_cap_hit'
  | 'error_occurred';

export interface ProactiveTriggerConfig {
  type: ProactiveTriggerType;
  enabled: boolean;
  /** Template for what JARVIS says */
  messageTemplate: string;
  /** Minimum cooldown between same-trigger proactive speech (ms) */
  cooldownMs: number;
}

export interface ProactiveSpeechEvent {
  id: string;
  triggerType: ProactiveTriggerType;
  message: string;
  missionId?: string;
  timestamp: Date;
}

// ---- Quiet Hours ----

export interface QuietHoursConfig {
  enabled: boolean;
  /** Start time in HH:MM format (24h) */
  start: string;
  /** End time in HH:MM format (24h) */
  end: string;
  /** Timezone IANA identifier */
  timezone: string;
}

// ---- HeyGen Avatar ----

export type AvatarSessionState = 'disconnected' | 'connecting' | 'connected' | 'speaking' | 'error';

export interface AvatarSession {
  id: string;
  state: AvatarSessionState;
  sessionId: string | null;
  token: string | null;
  webrtcOffer: RTCSessionDescriptionInit | null;
  createdAt: Date;
  lastActivityAt: Date;
}

// ---- Vision (Optional, off by default) ----

export interface VisionConfig {
  enabled: boolean;
  /** Send frames at 1 FPS to Gemini Live */
  fps: number;
  /** Never persist frames */
  persistFrames: boolean;
}

// ---- Audio Budget ----

export interface AudioBudgetConfig {
  /** Max audio tokens per session */
  maxSessionTokens: number;
  /** Max audio tokens per day */
  maxDailyTokens: number;
  /** Current daily usage (in-memory, reset at midnight) */
  dailyUsed: number;
}

// ---- API Request/Response Types ----

export interface AmbientStartRequest {
  missionId?: string;
  /** Override idle timeout in seconds (default: 75) */
  idleTimeoutSec?: number;
}

export interface AmbientStatusResponse {
  state: AmbientSessionState;
  hasActiveSession: boolean;
  sessionId?: string;
  budgetUsed?: { inputTokens: number; outputTokens: number };
  wakeWordEngine: WakeWordEngine | null;
  isWakeWordActive: boolean;
  visionEnabled: boolean;
  avatarState: AvatarSessionState;
  quietHoursActive: boolean;
}

export interface ProactiveTriggerUpdateRequest {
  type: ProactiveTriggerType;
  enabled?: boolean;
  messageTemplate?: string;
  cooldownMs?: number;
}

export interface AvatarStartRequest {
  /** Optional avatar ID for HeyGen */
  avatarId?: string;
}

export interface AvatarTokenResponse {
  token: string;
  expiresAt: string;
  serverUrl: string;
}
