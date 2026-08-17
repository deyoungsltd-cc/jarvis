import { Router, Request, Response, NextFunction } from 'express';
import { memoryService } from '../services/memoryService.js';
import { badRequest } from '../utils/errors.js';

const VALID_SCOPES = ['working', 'episodic', 'semantic', 'preference', 'project'];

const router = Router();

/** GET /memory — list all memories */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { scope } = _req.query;
    let entries;
    if (scope && typeof scope === 'string') {
      entries = await memoryService.listByScope(scope);
    } else {
      entries = await memoryService.list();
    }
    res.json(entries.map(e => ({
      ...e,
      value: e.value ? JSON.parse(e.value) : null,
    })));
  } catch (err) { next(err); }
});

/** POST /memory — store a memory */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { scope, key, value } = req.body;
    if (!scope || !VALID_SCOPES.includes(scope)) {
      throw badRequest('VALIDATION_ERROR', `Scope must be one of: ${VALID_SCOPES.join(', ')}`, requestId);
    }
    if (!key || typeof key !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'Key is required and must be a string', requestId);
    }
    const entry = await memoryService.create({ scope, key, value });
    res.status(201).json({
      ...entry,
      value: entry.value ? JSON.parse(entry.value) : null,
    });
  } catch (err) { next(err); }
});

/** DELETE /memory/:id — delete a memory */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await memoryService.remove(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
