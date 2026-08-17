import { Router, Request, Response, NextFunction } from 'express';
import { missionService } from '../services/missionService.js';
import { missionEventService } from '../services/missionEventService.js';
import { badRequest } from '../utils/errors.js';

const router = Router();

/** GET /missions — list all missions */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const missions = await missionService.list(requestId);
    // Parse JSON fields before sending
    const parsed = missions.map(m => ({
      ...m,
      plan: m.plan ? JSON.parse(m.plan) : null,
      events: m.events.map(e => ({
        ...e,
        payload: e.payload ? JSON.parse(e.payload) : null,
      })),
    }));
    res.json(parsed);
  } catch (err) { next(err); }
});

/** GET /missions/:id — get a mission with its events */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const mission = await missionService.getById(req.params.id, requestId);
    res.json({
      ...mission,
      plan: mission.plan ? JSON.parse(mission.plan) : null,
      events: mission.events.map(e => ({
        ...e,
        payload: e.payload ? JSON.parse(e.payload) : null,
      })),
    });
  } catch (err) { next(err); }
});

/** POST /missions — create a mission */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { goal } = req.body;
    if (!goal || typeof goal !== 'string' || goal.trim().length === 0) {
      throw badRequest('VALIDATION_ERROR', 'Mission goal is required and must be a non-empty string', requestId);
    }
    const mission = await missionService.create(req.body, requestId);
    res.status(201).json(mission);
  } catch (err) { next(err); }
});

/** PATCH /missions/:id — update a mission */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const mission = await missionService.update(req.params.id, req.body, requestId);
    res.json({
      ...mission,
      plan: mission.plan ? JSON.parse(mission.plan) : null,
    });
  } catch (err) { next(err); }
});

/** DELETE /missions/:id — delete a mission */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    await missionService.remove(req.params.id, requestId);
    res.status(204).send();
  } catch (err) { next(err); }
});

/** GET /missions/:id/events — list events for a mission */
router.get('/:id/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const events = await missionEventService.listByMission(req.params.id, requestId);
    res.json(events.map(e => ({
      ...e,
      payload: e.payload ? JSON.parse(e.payload) : null,
    })));
  } catch (err) { next(err); }
});

/** POST /missions/:id/events — record a mission event */
router.post('/:id/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { type, payload } = req.body;
    if (!type || typeof type !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'Event type is required and must be a string', requestId);
    }
    const event = await missionEventService.create({
      missionId: req.params.id,
      type,
      payload,
    }, requestId);
    res.status(201).json({
      ...event,
      payload: event.payload ? JSON.parse(event.payload) : null,
    });
  } catch (err) { next(err); }
});

export default router;
