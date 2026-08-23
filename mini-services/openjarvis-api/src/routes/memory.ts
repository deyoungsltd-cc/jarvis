/**
 * Memory Routes — Phase 6 Enhanced
 *
 * Full CRUD + search, stats, bulk operations.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { memoryService, VALID_SCOPES, VALID_SOURCES } from '../services/memoryService.js';
import { badRequest, notFound } from '../utils/errors.js';

const router = Router();

/** GET /memory — list all memories, optional scope filter */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scope } = req.query;
    let entries;
    if (scope && typeof scope === 'string') {
      if (!VALID_SCOPES.includes(scope as any)) {
        const requestId = (req as any).requestId as string;
        throw badRequest('VALIDATION_ERROR', `Invalid scope. Must be one of: ${VALID_SCOPES.join(', ')}`, requestId);
      }
      entries = await memoryService.listByScope(scope);
    } else {
      entries = await memoryService.list();
    }
    res.json(entries.map(formatEntry));
  } catch (err) { next(err); }
});

/** GET /memory/search — search memories by query */
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, scope, limit, min_importance, tags } = req.query;
    if (!q || typeof q !== 'string') {
      const requestId = (req as any).requestId as string;
      throw badRequest('VALIDATION_ERROR', 'Query parameter "q" is required', requestId);
    }
    const results = await memoryService.search(q, {
      scope: typeof scope === 'string' ? scope : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      minImportance: min_importance ? parseInt(min_importance as string, 10) : undefined,
      tags: typeof tags === 'string' ? tags.split(',') : undefined,
    });
    res.json(results);
  } catch (err) { next(err); }
});

/** GET /memory/stats — memory statistics */
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await memoryService.getStats();
    res.json(stats);
  } catch (err) { next(err); }
});

/** GET /memory/scopes — list valid scopes */
router.get('/scopes', async (_req: Request, res: Response) => {
  res.json({ scopes: VALID_SCOPES });
});

/** GET /memory/:id — get a single memory */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entry = await memoryService.getById(req.params.id);
    if (!entry) {
      const requestId = (req as any).requestId as string;
      throw notFound('NOT_FOUND', `Memory entry not found: ${req.params.id}`, requestId);
    }
    res.json(formatEntry(entry));
  } catch (err) { next(err); }
});

/** GET /memory/:id/associations — get associated memories */
router.get('/:id/associations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const direction = (req.query.direction as 'from' | 'to' | undefined);
    const associations = await memoryService.getAssociated(req.params.id, direction);
    res.json(associations);
  } catch (err) { next(err); }
});

/** POST /memory — store a new memory */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId as string;
    const { scope, key, value, tags, missionId, source, importance, expiresAt } = req.body;
    if (!scope || !VALID_SCOPES.includes(scope)) {
      throw badRequest('VALIDATION_ERROR', `Scope must be one of: ${VALID_SCOPES.join(', ')}`, requestId);
    }
    if (!key || typeof key !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'Key is required and must be a string', requestId);
    }
    if (source && !VALID_SOURCES.includes(source)) {
      throw badRequest('VALIDATION_ERROR', `Source must be one of: ${VALID_SOURCES.join(', ')}`, requestId);
    }
    if (importance !== undefined && (importance < 1 || importance > 5)) {
      throw badRequest('VALIDATION_ERROR', 'Importance must be between 1 and 5', requestId);
    }
    const entry = await memoryService.create({
      scope,
      key,
      value,
      tags,
      missionId,
      source,
      importance,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });
    res.status(201).json(formatEntry(entry));
  } catch (err) { next(err); }
});

/** PATCH /memory/:id — update a memory */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId as string;
    const { value, tags, importance, expiresAt } = req.body;
    if (importance !== undefined && (importance < 1 || importance > 5)) {
      throw badRequest('VALIDATION_ERROR', 'Importance must be between 1 and 5', requestId);
    }
    const entry = await memoryService.update(req.params.id, {
      value,
      tags,
      importance,
      expiresAt: expiresAt === null ? null : expiresAt ? new Date(expiresAt) : undefined,
    });
    res.json(formatEntry(entry));
  } catch (err) { next(err); }
});

/** POST /memory/consolidate — merge duplicate memories */
router.post('/consolidate', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await memoryService.consolidate();
    res.json(result);
  } catch (err) { next(err); }
});

/** POST /memory/purge-expired — delete expired memories */
router.post('/purge-expired', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await memoryService.purgeExpired();
    res.json({ purged: count });
  } catch (err) { next(err); }
});

/** POST /memory/bulk-delete — delete multiple memories */
router.post('/bulk-delete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId as string;
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw badRequest('VALIDATION_ERROR', 'ids must be a non-empty array', requestId);
    }
    const count = await memoryService.bulkRemove(ids);
    res.json({ deleted: count });
  } catch (err) { next(err); }
});

/** DELETE /memory/:id — delete a memory */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await memoryService.remove(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

// ---- Helpers ----

function formatEntry(entry: any) {
  return {
    ...entry,
    value: entry.value ? (() => { try { return JSON.parse(entry.value); } catch { return entry.value; } })() : null,
    tags: entry.tags ? (() => { try { return JSON.parse(entry.tags); } catch { return []; } })() : [],
  };
}

export default router;
