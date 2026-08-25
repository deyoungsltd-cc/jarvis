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
  AuditLogList,
  ExportRequest,
  Analytics,
  Macro,
  MacroStep,
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
} from './openjarvis-types';

const PORT = '3001';

// Internal API: routes go to Next.js /api/*
function url(path: string): string {
  return `/api${path}`;
}

// External API: routes go to Express backend via proxy (legacy)
function externalUrl(path: string): string {
  return `${path}?XTransformPort=${PORT}`;
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url(path), {
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
export function checkHealth(): Promise<HealthCheck> {
  return request('/health');
}

// ─── Missions ──────────────────────────────────────────────
export function getMissions(): Promise<Mission[]> {
  return request('/missions');
}

export function createMission(body: CreateMissionBody): Promise<Mission> {
  return request('/missions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getMission(id: string): Promise<Mission> {
  return request(`/missions/${id}`);
}

export function updateMission(
  id: string,
  body: UpdateMissionBody
): Promise<Mission> {
  return request(`/missions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteMission(id: string): Promise<void> {
  return request(`/missions/${id}`, { method: 'DELETE' });
}

// ─── Mission Events ────────────────────────────────────────
export function getMissionEvents(id: string): Promise<MissionEvent[]> {
  return request(`/missions/${id}/events`);
}

export function createMissionEvent(
  missionId: string,
  body: CreateEventBody
): Promise<MissionEvent> {
  return request(`/missions/${missionId}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ─── Tools ─────────────────────────────────────────────────
export function getTools(): Promise<Tool[]> {
  return request('/tools');
}

export function createTool(body: CreateToolBody): Promise<Tool> {
  return request('/tools', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getTool(name: string): Promise<Tool> {
  return request(`/tools/${encodeURIComponent(name)}`);
}

export function updateTool(
  name: string,
  body: UpdateToolBody
): Promise<Tool> {
  return request(`/tools/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteTool(name: string): Promise<void> {
  return request(`/tools/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

// ─── Memory (Phase 6 Enhanced) ──────────────────────────────
export function getMemory(scope?: string): Promise<MemoryEntry[]> {
  const query = scope ? `?scope=${scope}` : '';
  return request(`/memory${query}`);
}

export function searchMemory(query: string, options?: { scope?: string; limit?: number; tags?: string[] }): Promise<MemorySearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (options?.scope) params.set('scope', options.scope);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.tags) params.set('tags', options.tags.join(','));
  return request(`/memory/search?${params}`);
}

export function getMemoryStats(): Promise<MemoryStats> {
  return request('/memory/stats');
}

export function getMemoryById(id: string): Promise<MemoryEntry> {
  return request(`/memory/${id}`);
}

export function createMemory(body: CreateMemoryBody): Promise<MemoryEntry> {
  return request('/memory', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateMemory(id: string, body: { value?: unknown; tags?: string[]; importance?: number }): Promise<MemoryEntry> {
  return request(`/memory/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteMemory(id: string): Promise<void> {
  return request(`/memory/${id}`, { method: 'DELETE' });
}

export function consolidateMemory(): Promise<{ merged: number }> {
  return request('/memory/consolidate', { method: 'POST' });
}

export function purgeExpiredMemory(): Promise<{ purged: number }> {
  return request('/memory/purge-expired', { method: 'POST' });
}

export function bulkDeleteMemory(ids: string[]): Promise<{ deleted: number }> {
  return request('/memory/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

// ─── Agent ─────────────────────────────────────────────────
export function runAgent(body: AgentRunBody): Promise<{ missionId: string }> {
  return request('/agent/run', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getTransitions(): Promise<StateTransition[]> {
  return request('/agent/transitions');
}

// ─── Permissions ──────────────────────────────────────────
export function getPermissions(): Promise<Array<Record<string, unknown>>> {
  return request('/permissions');
}

export function grantPermission(body: { capability: string; scope?: string; missionId?: string }): Promise<{ granted: boolean }> {
  return request('/permissions/grant', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function revokePermission(body: { capability: string }): Promise<{ granted: boolean }> {
  return request('/permissions/revoke', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ─── Voice (Phase 5) ──────────────────────────────────────
export function getVoiceStatus(): Promise<VoiceStatus> {
  return request('/voice/status');
}

export function switchVoiceProvider(provider: string): Promise<VoiceStatus> {
  return request('/voice/provider', {
    method: 'POST',
    body: JSON.stringify({ provider }),
  });
}

export function speechToText(audio: string, format: string, language?: string): Promise<STTResponse> {
  return request('/voice/stt', {
    method: 'POST',
    body: JSON.stringify({ audio, format, language }),
  });
}

export function textToSpeech(text: string, options?: { language?: string; voice?: string; speed?: number }): Promise<TTSResponse> {
  return request('/voice/tts', {
    method: 'POST',
    body: JSON.stringify({ text, ...options }),
  });
}

export function getVoiceSessions(): Promise<VoiceSession[]> {
  return request('/voice/sessions');
}

export function createVoiceSession(opts?: { missionId?: string; provider?: string; language?: string; voice?: string }): Promise<VoiceSession> {
  return request('/voice/sessions', {
    method: 'POST',
    body: JSON.stringify(opts || {}),
  });
}

export function getVoiceSession(id: string): Promise<VoiceSession> {
  return request(`/voice/sessions/${id}`);
}

export function deleteVoiceSession(id: string): Promise<{ deleted: boolean }> {
  return request(`/voice/sessions/${id}`, { method: 'DELETE' });
}

export function addVoiceTranscript(sessionId: string, text: string, direction: 'user' | 'agent', confidence?: number): Promise<{ id: string; timestamp: string; direction: string; text: string }> {
  return request(`/voice/sessions/${sessionId}/transcript`, {
    method: 'POST',
    body: JSON.stringify({ text, direction, confidence }),
  });
}

export function setVoiceSessionStatus(sessionId: string, status: string): Promise<{ id: string; status: string }> {
  return request(`/voice/sessions/${sessionId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

// ─── Approvals (Phase 10) ──────────────────────────────
export function getApprovals(filters?: { missionId?: string; status?: string; riskLevel?: string; limit?: number; offset?: number }): Promise<ApprovalRequestList> {
  const params = new URLSearchParams();
  if (filters?.missionId) params.set('missionId', filters.missionId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.riskLevel) params.set('riskLevel', filters.riskLevel);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return request(`/approvals${qs ? `?${qs}` : ''}`);
}

export function getPendingApprovals(): Promise<ApprovalRequestList> {
  return request('/approvals/pending');
}

export function getApprovalStats(): Promise<ApprovalStats> {
  return request('/approvals/stats');
}

export function getApproval(id: string): Promise<ApprovalRequest> {
  return request(`/approvals/${id}`);
}

export function approveRequest(id: string, options?: { response?: string; alwaysAllow?: boolean }): Promise<ApprovalRequest> {
  return request(`/approvals/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

export function rejectRequest(id: string, response?: string): Promise<ApprovalRequest> {
  return request(`/approvals/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ response }),
  });
}

export function cancelRequest(id: string): Promise<ApprovalRequest> {
  return request(`/approvals/${id}/cancel`, { method: 'POST' });
}

export function expirePendingApprovals(): Promise<{ expired: number }> {
  return request('/approvals/expire', { method: 'POST' });
}

export function getApprovalRules(): Promise<ApprovalRule[]> {
  return request('/approvals/rules');
}

export function createApprovalRule(data: {
  name: string;
  description?: string;
  matchRiskLevels?: string[];
  matchToolNames?: string[];
  matchCapabilities?: string[];
  action: 'auto_approve' | 'auto_reject' | 'require_manual';
  priority?: number;
}): Promise<ApprovalRule> {
  return request('/approvals/rules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateApprovalRule(id: string, data: Partial<Omit<ApprovalRule, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ApprovalRule> {
  return request(`/approvals/rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteApprovalRule(id: string): Promise<{ deleted: boolean }> {
  return request(`/approvals/rules/${id}`, { method: 'DELETE' });
}

// ─── Capability Grants (Authorization Model) ──────────
export function getCapabilityGrants(filters?: { capability?: string; allowed?: boolean; scopeType?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (filters?.capability) params.set('capability', filters.capability);
  if (filters?.allowed !== undefined) params.set('allowed', String(filters.allowed));
  if (filters?.scopeType) params.set('scopeType', filters.scopeType);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return request(`/capabilities/grants${qs ? `?${qs}` : ''}`);
}

export function getCapabilityStatuses() {
  return request('/capabilities/statuses');
}

export function createCapabilityGrant(data: {
  capability: string;
  allowed: boolean;
  scopeType?: string;
  scopeContext?: Record<string, unknown>;
  missionId?: string;
}) {
  return request('/capabilities/grants', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateCapabilityGrant(id: string, data: { allowed?: boolean; scopeType?: string; scopeContext?: Record<string, unknown> | null }) {
  return request(`/capabilities/grants/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function revokeCapabilityGrant(id: string) {
  return request(`/capabilities/grants/${id}`, { method: 'DELETE' });
}

export function revokeAllCapabilityGrants(capability: string) {
  return request(`/capabilities/grants/${capability}/revoke-all`, { method: 'DELETE' });
}

// ─── Workspaces ─────────────────────────────────────────
export function getWorkspaces(): Promise<Workspace[]> {
  return request('/workspaces');
}

export function createWorkspace(data: { name: string; description?: string; ownerId?: string }): Promise<Workspace> {
  return request('/workspaces', { method: 'POST', body: JSON.stringify(data) });
}

export function getWorkspace(id: string): Promise<Workspace> {
  return request(`/workspaces/${id}`);
}

export function updateWorkspace(id: string, data: { name?: string; description?: string }): Promise<Workspace> {
  return request(`/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteWorkspace(id: string): Promise<void> {
  return request(`/workspaces/${id}`, { method: 'DELETE' });
}

// ─── Audit Logs ─────────────────────────────────────────
export function getAuditLogs(filters?: { userId?: string; deviceId?: string; action?: string; limit?: number; offset?: string; from?: string; to?: string }): Promise<AuditLogList> {
  const params = new URLSearchParams();
  if (filters?.userId) params.set('userId', filters.userId);
  if (filters?.deviceId) params.set('deviceId', filters.deviceId);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', filters.offset);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const qs = params.toString();
  return request(`/audit${qs ? `?${qs}` : ''}`);
}

// ─── Export ─────────────────────────────────────────────
export function exportMission(data: ExportRequest): Promise<Blob> {
  return fetch(url('/export'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    const blob = await res.blob();
    return blob;
  });
}

// ─── Analytics ──────────────────────────────────────────
export function getAnalytics(): Promise<Analytics> {
  return request('/analytics');
}

// ─── Macros ─────────────────────────────────────────────
export function getMacros(): Promise<Macro[]> {
  return request('/macros');
}

export function createMacro(data: { name: string; description?: string; trigger?: string; steps: MacroStep[] }): Promise<Macro> {
  return request('/macros', { method: 'POST', body: JSON.stringify(data) });
}

export function updateMacro(id: string, data: Partial<Pick<Macro, 'name' | 'description' | 'trigger' | 'steps' | 'enabled'>>): Promise<Macro> {
  return request(`/macros/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteMacro(id: string): Promise<void> {
  return request(`/macros/${id}`, { method: 'DELETE' });
}

export function runMacro(id: string): Promise<Macro> {
  return request(`/macros/${id}/run`, { method: 'POST' });
}

// ─── Devices ────────────────────────────────────────────
export function getDevices(): Promise<Device[]> {
  return request('/devices');
}

export function registerDevice(data: { name: string; hostname: string; os?: string; arch?: string; capabilities?: string[] }): Promise<Device> {
  return request('/devices', { method: 'POST', body: JSON.stringify(data) });
}

export function updateDevice(id: string, data: Partial<Pick<Device, 'name' | 'status' | 'ipAddress' | 'daemonVersion' | 'capabilities'>>): Promise<Device> {
  return request(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteDevice(id: string): Promise<void> {
  return request(`/devices/${id}`, { method: 'DELETE' });
}

// ─── Daemon Commands ────────────────────────────────────
export function sendDaemonCommand(deviceId: string, command: string, params?: Record<string, unknown>): Promise<{ commandId: string; status: string }> {
  return request('/daemon/ws', { method: 'POST', body: JSON.stringify({ deviceId, command, params }) });
}

export function getDaemonCommands(deviceId: string): Promise<{ commands: DaemonCommand[] }> {
  return request(`/daemon/ws?deviceId=${deviceId}`);
}

export function reportDaemonResult(data: DaemonCommandResult): Promise<void> {
  return request('/daemon/result', { method: 'POST', body: JSON.stringify(data) });
}

// ─── Plugins ────────────────────────────────────────────
export function getPlugins(): Promise<Plugin[]> {
  return request('/plugins');
}

export function createPlugin(data: { name: string; version?: string; description?: string; config?: Record<string, unknown> }): Promise<Plugin> {
  return request('/plugins', { method: 'POST', body: JSON.stringify(data) });
}

export function togglePlugin(id: string, enabled: boolean): Promise<Plugin> {
  return request(`/plugins/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
}

export function deletePlugin(id: string): Promise<void> {
  return request(`/plugins/${id}`, { method: 'DELETE' });
}

// ─── Documents (RAG) ────────────────────────────────────
export function getDocuments(): Promise<RagDocument[]> {
  return request('/documents');
}

export function uploadDocument(file: File): Promise<RagDocument> {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(url('/documents'), { method: 'POST', body: formData }).then(async (res) => {
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  });
}

export function deleteDocument(id: string): Promise<void> {
  return request(`/documents/${id}`, { method: 'DELETE' });
}

// ─── Webhooks ───────────────────────────────────────────
export function getWebhooks(): Promise<Webhook[]> {
  return request('/webhooks');
}

export function createWebhook(data: { url: string; events: string[]; secret?: string }): Promise<Webhook> {
  return request('/webhooks', { method: 'POST', body: JSON.stringify(data) });
}

export function updateWebhook(id: string, data: Partial<Pick<Webhook, 'url' | 'events' | 'secret' | 'enabled'>>): Promise<Webhook> {
  return request(`/webhooks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteWebhook(id: string): Promise<void> {
  return request(`/webhooks/${id}`, { method: 'DELETE' });
}

// ─── Scheduler ──────────────────────────────────────────
export function getScheduledJobs(): Promise<ScheduledJob[]> {
  return request('/scheduler');
}

export function createScheduledJob(data: { name: string; cronExpr: string; goal: string; provider?: string }): Promise<ScheduledJob> {
  return request('/scheduler', { method: 'POST', body: JSON.stringify(data) });
}

export function updateScheduledJob(id: string, data: Partial<Pick<ScheduledJob, 'name' | 'cronExpr' | 'goal' | 'provider' | 'enabled'>>): Promise<ScheduledJob> {
  return request(`/scheduler/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteScheduledJob(id: string): Promise<void> {
  return request(`/scheduler/${id}`, { method: 'DELETE' });
}

// ─── Vault ──────────────────────────────────────────────
export function getVaultEntries(): Promise<Array<Pick<VaultEntry, 'id' | 'key' | 'createdAt' | 'updatedAt'>>> {
  return request('/vault');
}

export function storeVaultEntry(key: string, value: string): Promise<VaultEntry> {
  return request('/vault', { method: 'POST', body: JSON.stringify({ key, value }) });
}

export function getVaultEntry(key: string): Promise<VaultEntry> {
  return request(`/vault/${encodeURIComponent(key)}`);
}

export function deleteVaultEntry(key: string): Promise<void> {
  return request(`/vault/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

// ─── API Keys ───────────────────────────────────────────
export function getApiKeys(): Promise<ApiKey[]> {
  return request('/api-keys');
}

export function createApiKey(name: string): Promise<ApiKey> {
  return request('/api-keys', { method: 'POST', body: JSON.stringify({ name }) });
}

// ─── Users ──────────────────────────────────────────────
export function getUsers(): Promise<UserInfo[]> {
  return request('/users');
}

// ─── Agent Chat (streaming) ────────────────────────────────
export async function streamChat(messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<ReadableStream> {
  const res = await fetch(url('/agent/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`Chat API ${res.status}: ${body}`);
  }
  if (!res.body) throw new Error('No response body');
  return res.body;
}
