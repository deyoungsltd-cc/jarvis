import type {
  Mission,
  CreateMissionBody,
  UpdateMissionBody,
  MissionEvent,
  CreateEventBody,
  Tool,
  CreateToolBody,
  UpdateToolBody,
  MemoryEntry,
  CreateMemoryBody,
  MemorySearchResult,
  MemoryStats,
  AgentRunBody,
  StateTransition,
  HealthCheck,
  VoiceStatus,
  STTResponse,
  TTSResponse,
  VoiceSession,
  ApprovalRequest,
  ApprovalRequestList,
  ApprovalStats,
  ApprovalRule,
  Workspace,
  Device,
  DaemonCommand,
  DaemonCommandResult,
  Plugin,
  RagDocument,
  Webhook,
  ScheduledJob,
  VaultEntry,
  ApiKey,
  UserInfo,
  Macro,
  MacroStep,
  ExportRequest,
  Analytics,
  AuditLogList,
} from './openjarvis-types';

function api(path: string): string {
  return `/api${path}`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(api(path), {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

// ─── Health ────────────────────────────────────────────────
export function checkHealth(): Promise<HealthCheck> { return request('/health'); }

// ─── Missions ──────────────────────────────────────────────
export async function getMissions(page = 1, limit = 20): Promise<{ missions: Mission[]; total: number; pages: number }> {
  return request(`/missions?page=${page}&limit=${limit}`);
}

export function createMission(body: CreateMissionBody): Promise<Mission> {
  return request('/missions', { method: 'POST', body: JSON.stringify(body) });
}
export function getMission(id: string): Promise<Mission> { return request(`/missions/${id}`); }
export function updateMission(id: string, body: UpdateMissionBody): Promise<Mission> {
  return request(`/missions/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export function deleteMission(id: string): Promise<void> { return request(`/missions/${id}`, { method: 'DELETE' }); }

// ─── Mission Events ────────────────────────────────────────
export function getMissionEvents(id: string): Promise<MissionEvent[]> { return request(`/missions/${id}/events`); }
export function createMissionEvent(missionId: string, body: CreateEventBody): Promise<MissionEvent> {
  return request(`/missions/${missionId}/events`, { method: 'POST', body: JSON.stringify(body) });
}

// ─── Tools ─────────────────────────────────────────────────
export function getTools(): Promise<Tool[]> { return request('/tools'); }
export function createTool(body: CreateToolBody): Promise<Tool> {
  return request('/tools', { method: 'POST', body: JSON.stringify(body) });
}
export function getTool(name: string): Promise<Tool> { return request(`/tools/${encodeURIComponent(name)}`); }
export function updateTool(name: string, body: UpdateToolBody): Promise<Tool> {
  return request(`/tools/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export function deleteTool(name: string): Promise<void> {
  return request(`/tools/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

// ─── Memory ────────────────────────────────────────────────
export function getMemory(scope?: string): Promise<MemoryEntry[]> {
  return request(`/memory${scope ? `?scope=${scope}` : ''}`);
}
export function searchMemory(query: string, options?: { scope?: string; limit?: number; tags?: string[] }): Promise<MemorySearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (options?.scope) params.set('scope', options.scope);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.tags) params.set('tags', options.tags.join(','));
  return request(`/memory/search?${params}`);
}
export function getMemoryStats(): Promise<MemoryStats> { return request('/memory/stats'); }
export function getMemoryById(id: string): Promise<MemoryEntry> { return request(`/memory/${id}`); }
export function createMemory(body: CreateMemoryBody): Promise<MemoryEntry> {
  return request('/memory', { method: 'POST', body: JSON.stringify(body) });
}
export function updateMemory(id: string, body: { value?: unknown; tags?: string[]; importance?: number }): Promise<MemoryEntry> {
  return request(`/memory/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export function deleteMemory(id: string): Promise<void> { return request(`/memory/${id}`, { method: 'DELETE' }); }
export function consolidateMemory(): Promise<{ merged: number }> { return request('/memory/consolidate', { method: 'POST' }); }
export function purgeExpiredMemory(): Promise<{ purged: number }> { return request('/memory/purge-expired', { method: 'POST' }); }
export function bulkDeleteMemory(ids: string[]): Promise<{ deleted: number }> {
  return request('/memory/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
}

// ─── Agent ─────────────────────────────────────────────────
export function runAgent(body: AgentRunBody): Promise<{ missionId: string }> {
  return request('/agent/run', { method: 'POST', body: JSON.stringify(body) });
}
export function getTransitions(): Promise<StateTransition[]> { return request('/agent/transitions'); }

// ─── Agent Chat (streaming) ────────────────────────────────
export async function streamChat(messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<ReadableStream> {
  const res = await fetch(api('/agent/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) { const body = await res.text().catch(() => res.statusText); throw new Error(`Chat API ${res.status}: ${body}`); }
  if (!res.body) throw new Error('No response body');
  return res.body;
}

// ─── Approvals ─────────────────────────────────────────────
export function getApprovals(filters?: { missionId?: string; status?: string; riskLevel?: string; limit?: number; offset?: number }): Promise<ApprovalRequestList> {
  const params = new URLSearchParams();
  if (filters?.missionId) params.set('missionId', filters.missionId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.riskLevel) params.set('riskLevel', filters.riskLevel);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  return request(`/approvals${params.toString() ? `?${params}` : ''}`);
}
export function getPendingApprovals(): Promise<ApprovalRequestList> { return request('/approvals/pending'); }
export function getApprovalStats(): Promise<ApprovalStats> { return request('/approvals/stats'); }
export function getApproval(id: string): Promise<ApprovalRequest> { return request(`/approvals/${id}`); }
export function approveRequest(id: string, options?: { response?: string; alwaysAllow?: boolean }): Promise<ApprovalRequest> {
  return request(`/approvals/${id}/approve`, { method: 'POST', body: JSON.stringify(options || {}) });
}
export function rejectRequest(id: string, response?: string): Promise<ApprovalRequest> {
  return request(`/approvals/${id}/reject`, { method: 'POST', body: JSON.stringify({ response }) });
}
export function cancelRequest(id: string): Promise<ApprovalRequest> { return request(`/approvals/${id}/cancel`, { method: 'POST' }); }
export function expirePendingApprovals(): Promise<{ expired: number }> { return request('/approvals/expire', { method: 'POST' }); }
export function getApprovalRules(): Promise<ApprovalRule[]> { return request('/approvals/rules'); }
export function createApprovalRule(data: {
  name: string; description?: string; matchRiskLevels?: string[]; matchToolNames?: string[];
  matchCapabilities?: string[]; action: 'auto_approve' | 'auto_reject' | 'require_manual'; priority?: number;
}): Promise<ApprovalRule> {
  return request('/approvals/rules', { method: 'POST', body: JSON.stringify(data) });
}
export function updateApprovalRule(id: string, data: Partial<Omit<ApprovalRule, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ApprovalRule> {
  return request(`/approvals/rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteApprovalRule(id: string): Promise<{ deleted: boolean }> {
  return request(`/approvals/rules/${id}`, { method: 'DELETE' });
}

// ─── Capability Grants ─────────────────────────────────────
export function getCapabilityGrants(filters?: { capability?: string; allowed?: boolean; scopeType?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (filters?.capability) params.set('capability', filters.capability);
  if (filters?.allowed !== undefined) params.set('allowed', String(filters.allowed));
  if (filters?.scopeType) params.set('scopeType', filters.scopeType);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  return request(`/capabilities/grants${params.toString() ? `?${params}` : ''}`);
}
export function getCapabilityStatuses() { return request('/capabilities/statuses'); }
export function createCapabilityGrant(data: { capability: string; allowed: boolean; scopeType?: string; scopeContext?: Record<string, unknown>; missionId?: string }) {
  return request('/capabilities/grants', { method: 'POST', body: JSON.stringify(data) });
}
export function updateCapabilityGrant(id: string, data: { allowed?: boolean; scopeType?: string; scopeContext?: Record<string, unknown> | null }) {
  return request(`/capabilities/grants/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function revokeCapabilityGrant(id: string) { return request(`/capabilities/grants/${id}`, { method: 'DELETE' }); }
export function revokeAllCapabilityGrants(capability: string) { return request(`/capabilities/${capability}/revoke-all`, { method: 'DELETE' }); }
