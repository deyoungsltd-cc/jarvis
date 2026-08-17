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
  AgentRunBody,
  StateTransition,
  HealthCheck,
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

// ─── Memory ────────────────────────────────────────────────
export function getMemory(): Promise<MemoryEntry[]> {
  return request('/memory');
}

export function createMemory(body: CreateMemoryBody): Promise<MemoryEntry> {
  return request('/memory', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteMemory(id: string): Promise<void> {
  return request(`/memory/${id}`, { method: 'DELETE' });
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
