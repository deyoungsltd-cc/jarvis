/**
 * Event Bus — Supabase Realtime Backend
 *
 * In serverless (Vercel), we can't hold an in-memory EventEmitter.
 * Instead, we insert events into the `realtime_events` table.
 * Supabase Realtime automatically broadcasts INSERTs to subscribed clients.
 *
 * Frontend subscribes via `useJarvisSocket` or directly:
 *   supabase.channel('global')
 *     .on('postgres_changes', { event: 'INSERT', table: 'realtime_events' }, ...)
 */

import { db } from './db';

export async function emitEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
  channel: string = 'global'
): Promise<string | null> {
  try {
    const rows = await db.$queryRawUnsafe<
      Array<{ id: string }>
    >(
      `INSERT INTO realtime_events (id, channel, event_type, payload)
       VALUES (gen_random_uuid(), '${channel.replace(/'/g, "''")}', '${eventType.replace(/'/g, "''")}', '${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb)
       RETURNING id`
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error(`[event-bus] Failed to emit ${eventType}:`, err);
    return null;
  }
}

// ─── Convenience wrappers ────────────────────────────────

export function emitMissionEvent(
  missionId: string,
  event: Record<string, unknown>
) {
  return emitEvent('mission:event', { ...event, missionId }, `mission:${missionId}`);
}

export function emitMissionStatus(missionId: string, status: string) {
  return emitEvent('mission:status', { missionId, status }, `mission:${missionId}`);
}

export function emitMissionUpdate(missionId: string, data: Record<string, unknown>) {
  return emitEvent('mission:update', { ...data, missionId }, `mission:${missionId}`);
}

export const eventBus = {
  emit(event: string, data: Record<string, unknown>) {
    // Fire-and-forget (serverless has no long-lived connection)
    emitEvent(event, data).catch(() => {});
  },
};
