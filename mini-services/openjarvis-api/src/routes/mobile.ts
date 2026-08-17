/**
 * Mobile API Routes — Phase 7
 *
 * Versioned mobile API under /mobile/v1/.
 * Features: API key auth, pagination, lightweight payloads,
 * SSE agent progress, client management.
 */
import { Router, Response, NextFunction } from 'express';
import { db } from '../utils/db.js';
import { missionService } from '../services/missionService.js';
import { missionEventService } from '../services/missionEventService.js';
import { memoryService } from '../services/memoryService.js';
import { mobileClientService } from '../services/mobileClientService.js';
import { requireMobileAuth, type MobileAuthRequest } from '../middleware/mobileAuth.js';
import { parsePagination, buildPaginatedResponse } from '../mobile/pagination.js';
import { badRequest } from '../utils/errors.js';

const router = Router();

// =================================================================
// Client Registration (no auth required)
// =================================================================

/** POST /mobile/v1/register — register a mobile client, get API key */
router.post('/register', async (req: MobileAuthRequest, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { name, platform } = req.body;
    if (!name || typeof name !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'Client name is required', requestId);
    }
    if (!platform || !['ios', 'android', 'web'].includes(platform)) {
      throw badRequest('VALIDATION_ERROR', 'Platform must be ios, android, or web', requestId);
    }
    const client = await mobileClientService.register({ name, platform });
    // Return apiKey only on registration
    res.status(201).json({
      id: client.id,
      name: client.name,
      platform: client.platform,
      apiKey: client.apiKey,
      createdAt: client.createdAt,
    });
  } catch (err) { next(err); }
});

// =================================================================
// Authenticated mobile endpoints
// =================================================================

// All routes below require API key
router.use(requireMobileAuth());

// ---- Missions (paginated, lightweight) ----

/** GET /mobile/v1/missions — paginated mission list (summary only) */
router.get('/missions', async (req: MobileAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { skip, take, page, limit } = parsePagination(req.query as any);
    const [missions, total] = await Promise.all([
      db.mission.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          goal: true,
          status: true,
          toolCallCount: true,
          tokenUsage: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.mission.count(),
    ]);

    res.json(buildPaginatedResponse(missions, total, page, limit));
  } catch (err) { next(err); }
});

/** GET /mobile/v1/missions/:id — mission detail with event summary */
router.get('/missions/:id', async (req: MobileAuthRequest, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const mission = await missionService.getById(req.params.id, requestId);
    // Lightweight: don't include full event payloads
    const eventSummary = await db.missionEvent.findMany({
      where: { missionId: req.params.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, createdAt: true },
    });
    res.json({
      id: mission.id,
      goal: mission.goal,
      status: mission.status,
      riskLevel: mission.riskLevel,
      toolCallCount: mission.toolCallCount,
      tokenUsage: mission.tokenUsage,
      budget: mission.budget,
      maxToolCalls: mission.maxToolCalls,
      createdAt: mission.createdAt,
      updatedAt: mission.updatedAt,
      eventCount: eventSummary.length,
      eventTypes: eventSummary.map(e => e.type),
    });
  } catch (err) { next(err); }
});

/** POST /mobile/v1/missions — create mission (mobile) */
router.post('/missions', async (req: MobileAuthRequest, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { goal } = req.body;
    if (!goal || typeof goal !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'Goal is required', requestId);
    }
    const mission = await missionService.create({ goal }, requestId);
    res.status(201).json({
      id: mission.id,
      goal: mission.goal,
      status: mission.status,
      createdAt: mission.createdAt,
    });
  } catch (err) { next(err); }
});

// ---- Events (paginated) ----

/** GET /mobile/v1/missions/:id/events — paginated events */
router.get('/missions/:id/events', async (req: MobileAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { skip, take, page, limit } = parsePagination(req.query as any);
    const where = { missionId: req.params.id };
    const [events, total] = await Promise.all([
      db.missionEvent.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'asc' },
      }),
      db.missionEvent.count({ where }),
    ]);

    const parsed = events.map(e => ({
      id: e.id,
      type: e.type,
      payload: e.payload ? (() => { try { return JSON.parse(e.payload); } catch { return e.payload; } })() : null,
      createdAt: e.createdAt,
    }));

    res.json(buildPaginatedResponse(parsed, total, page, limit));
  } catch (err) { next(err); }
});

/** GET /mobile/v1/missions/:id/events/stream — SSE event stream */
router.get('/missions/:id/events/stream', async (req: MobileAuthRequest, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const mission = await missionService.getById(req.params.id, requestId);

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send existing events first
    const events = await db.missionEvent.findMany({
      where: { missionId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });

    for (const event of events) {
      const payload = event.payload ? (() => { try { return JSON.parse(event.payload); } catch { return event.payload; } })() : null;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify({ id: event.id, type: event.type, payload, createdAt: event.createdAt })}\n\n`);
    }

    // If mission is complete, end the stream
    if (['completed', 'failed', 'cancelled', 'expired'].includes(mission.status)) {
      res.write('event: done\ndata: {\"status": "' + mission.status + '"}\n\n');
      res.end();
      return;
    }

    // Poll for new events (simple SSE without WebSocket dependency)
    let lastEventId = events.length > 0 ? events[events.length - 1].id : '';
    const pollInterval = setInterval(async () => {
      try {
        const newEvents = await db.missionEvent.findMany({
          where: { missionId: req.params.id },
          orderBy: { createdAt: 'asc' },
        });

        const fresh = newEvents.filter(e => e.id > lastEventId);
        for (const event of fresh) {
          lastEventId = event.id;
          const payload = event.payload ? (() => { try { return JSON.parse(event.payload); } catch { return event.payload; } })() : null;
          res.write(`event: ${event.type}\ndata: ${JSON.stringify({ id: event.id, type: event.type, payload, createdAt: event.createdAt })}\n\n`);
        }

        // Check if mission is terminal
        if (fresh.length > 0) {
          const lastType = fresh[fresh.length - 1].type;
          if (['complete', 'error', 'budget_exceeded'].includes(lastType)) {
            const currentMission = await db.mission.findUnique({ where: { id: req.params.id } });
            res.write(`event: done\ndata: {\"status": \"${currentMission?.status}\"}\n\n`);
            res.end();
            clearInterval(pollInterval);
          }
        }
      } catch {
        // Connection may have closed
        clearInterval(pollInterval);
      }
    }, 1000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(pollInterval);
    });

    // Auto-timeout after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (!res.writableEnded) {
        res.write('event: timeout\ndata: {}\n\n');
        res.end();
      }
    }, 5 * 60 * 1000);
  } catch (err) { next(err); }
});

// ---- Memory (paginated, searchable) ----

/** GET /mobile/v1/memory — paginated memory list */
router.get('/memory', async (req: MobileAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { skip, take, page, limit } = parsePagination(req.query as any);
    const scope = (req.query.scope as string) || undefined;

    const where: Record<string, unknown> = {};
    if (scope) where.scope = scope;

    const [entries, total] = await Promise.all([
      db.memoryEntry.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
      }),
      db.memoryEntry.count({ where }),
    ]);

    const parsed = entries.map(e => ({
      id: e.id,
      scope: e.scope,
      key: e.key,
      value: e.value ? (() => { try { return JSON.parse(e.value); } catch { return e.value; } })() : null,
      tags: e.tags ? (() => { try { return JSON.parse(e.tags); } catch { return []; } })() : [],
      importance: e.importance,
      source: e.source,
      createdAt: e.createdAt,
    }));

    res.json(buildPaginatedResponse(parsed, total, page, limit));
  } catch (err) { next(err); }
});

/** GET /mobile/v1/memory/search — search memories */
router.get('/memory/search', async (req: MobileAuthRequest, res: Response, next: NextFunction) => {
  try {
    const q = req.query.q as string;
    if (!q) {
      const requestId = (req as Record<string, unknown>).requestId as string;
      throw badRequest('VALIDATION_ERROR', 'Query parameter "q" is required', requestId);
    }
    const results = await memoryService.search(q, {
      scope: (req.query.scope as string) || undefined,
      limit: parseInt((req.query.limit as string) || '20', 10),
    });
    res.json({ results, count: results.length });
  } catch (err) { next(err); }
});

// ---- Tools (lightweight list) ----

/** GET /mobile/v1/tools — tool list (names and descriptions only) */
router.get('/tools', async (_req: MobileAuthRequest, res: Response, next: NextFunction) => {
  try {
    const tools = await db.tool.findMany({
      where: { enabled: true },
      select: { name: true, description: true, riskLevel: true },
      orderBy: { name: 'asc' },
    });
    res.json(tools);
  } catch (err) { next(err); }
});

// ---- Agent run (simplified for mobile) ----

/** POST /mobile/v1/agent/run — create mission + run agent (combined) */
router.post('/agent/run', async (req: MobileAuthRequest, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { goal } = req.body;
    if (!goal || typeof goal !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'Goal is required', requestId);
    }

    // Create the mission
    const mission = await missionService.create({ goal }, requestId);

    res.status(201).json({
      missionId: mission.id,
      status: mission.status,
      streamUrl: `/mobile/v1/missions/${mission.id}/events/stream`,
    });
  } catch (err) { next(err); }
});

// ---- Health (mobile) ----

/** GET /mobile/v1/health — mobile API health */
router.get('/health', (_req: MobileAuthRequest, res: Response) => {
  res.json({
    status: 'ok',
    version: 'v1',
    timestamp: new Date().toISOString(),
  });
});

export default router;
