// ─── Mission ────────────────────────────────────────────────
export type MissionStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'blocked'
  | 'failed'
  | 'completed'
  | 'paused'
  | 'cancelled'
  | 'expired';

export interface Mission {
  id: string;
  goal: string;
  status: MissionStatus;
  provider?: string;
  tokenCount?: number;
  toolCallCount?: number;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMissionBody {
  goal: string;
  provider?: string;
}

export interface UpdateMissionBody {
  goal?: string;
  status?: MissionStatus;
  provider?: string;
  tokenCount?: number;
  toolCallCount?: number;
  error?: string | null;
}

// ─── Mission Event ──────────────────────────────────────────
export type MissionEventType =
  | 'interpret'
  | 'plan'
  | 'tool_select'
  | 'tool_execute'
  | 'observe'
  | 'verify'
  | 'complete'
  | 'error'
  | 'budget_exceeded'
  | 'memory_update'
  | 'status_change'
  | 'custom';

export interface MissionEvent {
  id: string;
  missionId: string;
  type: MissionEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CreateEventBody {
  type: MissionEventType;
  payload?: Record<string, unknown>;
}

// ─── Tool ───────────────────────────────────────────────────
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  riskLevel?: RiskLevel;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateToolBody {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  riskLevel?: RiskLevel;
  enabled?: boolean;
}

export interface UpdateToolBody {
  description?: string;
  parameters?: Record<string, unknown>;
  riskLevel?: RiskLevel;
  enabled?: boolean;
}

// ─── Memory ─────────────────────────────────────────────────
export type MemoryScope = 'global' | 'mission' | 'session';

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  key: string;
  value: unknown;
  missionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemoryBody {
  scope: MemoryScope;
  key: string;
  value: unknown;
  missionId?: string;
}

// ─── Agent ──────────────────────────────────────────────────
export interface AgentRunBody {
  missionId: string;
  provider?: string;
}

export interface StateTransition {
  from: MissionStatus;
  to: MissionStatus[];
}

// ─── Health ─────────────────────────────────────────────────
export interface HealthCheck {
  status: string;
  timestamp?: string;
  details?: Record<string, unknown>;
}

// ─── WebSocket Payloads ─────────────────────────────────────
export interface WsMissionEvent {
  type: 'mission:event';
  data: MissionEvent;
}

export interface WsMissionStatus {
  type: 'mission:status';
  data: { missionId: string; status: MissionStatus; [key: string]: unknown };
}

export interface WsMissionUpdate {
  type: 'mission:update';
  data: Partial<Mission> & { missionId: string };
}

export type WsPayload = WsMissionEvent | WsMissionStatus | WsMissionUpdate;

// ─── Voice (Phase 5) ──────────────────────────────────────
export type VoiceCapability = 'stt' | 'tts' | 'streaming_stt' | 'streaming_tts';
export type VoiceSessionStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female' | 'neutral';
}

export interface VoiceStatus {
  availableProviders: string[];
  activeProvider: string;
  capabilities: VoiceCapability[];
  availableVoices: VoiceInfo[];
}

export interface STTResponse {
  text: string;
  confidence: number;
  language: string;
  durationMs: number;
  provider: string;
}

export interface TTSResponse {
  audio: string;
  format: string;
  sampleRate: number;
  durationMs: number;
  provider: string;
}

export interface VoiceSession {
  id: string;
  missionId?: string;
  status: VoiceSessionStatus;
  provider: string;
  language: string;
  voice: string;
  createdAt: string;
  lastActivityAt: string;
  transcript?: VoiceTranscriptEntry[];
  transcriptCount?: number;
}

export interface VoiceTranscriptEntry {
  id: string;
  timestamp: string;
  direction: 'user' | 'agent';
  text: string;
  confidence?: number;
  audioDurationMs?: number;
}

// ─── Agent Display State ────────────────────────────────────
export type AgentDisplayState =
  | 'idle'
  | 'executing'
  | 'waiting'
  | 'error'
  | 'success'
  | 'paused';
