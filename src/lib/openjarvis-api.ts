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
} from './openjarvis-types';

const PORT = '3001';

function url(path: string): string {
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
