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

// ─── Agent Display State ────────────────────────────────────
export type AgentDisplayState =
  | 'idle'
  | 'executing'
  | 'waiting'
  | 'error'
  | 'success'
  | 'paused';
