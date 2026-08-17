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

// ─── Memory (Phase 6 Enhanced) ────────────────────────────────
export type MemoryScope = 'working' | 'episodic' | 'semantic' | 'preference' | 'project';
export type MemorySource = 'agent' | 'user' | 'system' | 'import';

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  key: string;
  value: unknown;
  tags: string[];
  missionId?: string;
  source: MemorySource;
  importance: number;
  accessCount: number;
  lastAccessedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemoryBody {
  scope: MemoryScope;
  key: string;
  value?: unknown;
  tags?: string[];
  missionId?: string;
  source?: MemorySource;
  importance?: number;
  expiresAt?: string;
}

export interface MemorySearchResult {
  id: string;
  scope: string;
  key: string;
  value: unknown;
  tags: string[];
  importance: number;
  source: string;
  missionId?: string;
  createdAt: string;
  score: number;
}

export interface MemoryStats {
  totalEntries: number;
  byScope: Record<string, number>;
  byImportance: Record<number, number>;
  bySource: Record<string, number>;
  expiredCount: number;
  averageAccessCount: number;
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

// ─── Approval Workflow (Phase 10) ──────────────────────────
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
export type ApprovalAction = 'auto_approve' | 'auto_reject' | 'require_manual';

export interface ApprovalRequest {
  id: string;
  missionId: string;
  toolName: string;
  capability?: string;
  riskLevel: RiskLevel;
  status: ApprovalStatus;
  reason?: string;
  toolInput?: Record<string, unknown>;
  resolvedBy?: string;
  resolvedAt?: string;
  response?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRequestList {
  items: ApprovalRequest[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApprovalStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  cancelled: number;
}

export interface ApprovalRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  matchRiskLevels?: string[];
  matchToolNames?: string[];
  matchCapabilities?: string[];
  action: ApprovalAction;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface WsApprovalEvent {
  type: 'approval:created' | 'approval:resolved' | 'capability:grant_changed';
  data: {
    id: string;
    missionId: string;
    toolName: string;
    riskLevel?: string;
    status?: string;
    resolvedBy?: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

// ─── Capability Grant (Authorization Model) ──────────────────
export type GrantStatus = 'allowed' | 'denied' | 'undefined';
export type ScopeType = 'permanent' | 'mission' | 'session';

export interface CapabilityGrant {
  id: string;
  capability: string;
  allowed: boolean;
  scopeType: ScopeType;
  scopeContext?: Record<string, unknown>;
  missionId?: string;
  source: 'manual' | 'approval_always_allow';
  approvalRequestId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityGrantList {
  items: CapabilityGrant[];
  total: number;
  limit: number;
  offset: number;
}
