-- ============================================================
-- Supabase Realtime: Enable Replication + Notification Triggers
-- ============================================================
-- This migration enables Supabase Realtime on the key tables
-- and creates a trigger-based event broadcast system so that
-- serverless API routes can emit events (agent:thinking, tool:called,
-- approval:requested, etc.) through the database.
--
-- The frontend useJarvisSocket hook already listens for
-- postgres_changes on mission_events and missions.
-- This adds a lightweight "realtime_events" table for all other
-- event types, plus a helper function the API routes can call.
-- ============================================================

-- 1. Enable Realtime replication on mission_events and missions
ALTER PUBLICATION supabase_realtime ADD TABLE mission_events;
ALTER PUBLICATION supabase_realtime ADD TABLE missions;
ALTER PUBLICATION supabase_realtime ADD TABLE approval_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 2. Create a generic realtime_events table for non-mission events
-- (agent:thinking, agent:response, tool:called, tool:result,
--  agent:error, memory:created, memory:updated, approval:requested,
--  approval:resolved, notification:created, mission:started,
--  mission:completed, mission:failed, mission:event)
CREATE TABLE IF NOT EXISTS realtime_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel     TEXT NOT NULL DEFAULT 'global',
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_realtime_events_channel ON realtime_events (channel);
CREATE INDEX IF NOT EXISTS idx_realtime_events_created_at ON realtime_events (created_at);

-- 3. Enable Realtime on realtime_events so clients can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE realtime_events;

-- 4. Helper function: emit an event from serverless code
--    Usage from Prisma/SQL:
--      SELECT emit_event('agent:thinking', '{"text": "..."}'::jsonb);
--      SELECT emit_event('tool:called', '{"tool": "...", "input": {...}}'::jsonb, 'mission:uuid-here');
CREATE OR REPLACE FUNCTION emit_event(
  p_event_type  TEXT,
  p_payload     JSONB DEFAULT '{}',
  p_channel     TEXT DEFAULT 'global'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO realtime_events (id, channel, event_type, payload)
  VALUES (v_id, p_channel, p_event_type, p_payload);
  RETURN v_id;
END;
$$;

-- 5. Auto-cleanup: delete events older than 24 hours via pg_cron
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  SELECT cron.schedule(
    'cleanup-realtime-events',
    '0 * * * *',
    'DELETE FROM realtime_events WHERE created_at < now() - interval ''24 hours'';'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available, skipping scheduled cleanup';
END;
$$;