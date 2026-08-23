/**
 * Scheduler Routes — Round 2
 *
 * CRUD for scheduled tasks with cron/interval support.
 */
import { Router, Response, NextFunction } from 'express';
import { getScheduler } from '../services/schedulerService.js';
import { badRequest, notFound } from '../utils/errors.js';

const router = Router();

/** GET /scheduler/tasks — list all scheduled tasks */
router.get('/tasks', (_req: any, res: Response) => {
  const scheduler = getScheduler();
  const tasks = scheduler.listSchedules();
  res.json({ tasks, count: tasks.length });
});

/** POST /scheduler/tasks — create a new scheduled task */
router.post('/tasks', async (req: any, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId as string;
    const { name, cronExpression, intervalMs, goal, provider } = req.body;

    if (!name || typeof name !== 'string') {
      throw badRequest('VALIDATION_ERROR', '"name" is required', requestId);
    }
    if (!goal || typeof goal !== 'string') {
      throw badRequest('VALIDATION_ERROR', '"goal" is required', requestId);
    }
    if (!cronExpression && !intervalMs) {
      throw badRequest('VALIDATION_ERROR', 'Either "cronExpression" or "intervalMs" is required', requestId);
    }
    if (cronExpression && intervalMs) {
      throw badRequest('VALIDATION_ERROR', 'Provide only one of "cronExpression" or "intervalMs"', requestId);
    }

    const scheduler = getScheduler();
    const task = scheduler.createSchedule({
      name,
      cronExpression: cronExpression || undefined,
      intervalMs: intervalMs ? parseInt(intervalMs, 10) : undefined,
      goal,
      provider,
    });

    res.status(201).json(task);
  } catch (err) { next(err); }
});

/** DELETE /scheduler/tasks/:id — remove a task */
router.delete('/tasks/:id', (req: any, res: Response) => {
  const scheduler = getScheduler();
  const removed = scheduler.removeSchedule(req.params.id);
  if (!removed) {
    res.status(404).json(notFound('SCHEDULE_NOT_FOUND', 'Scheduled task not found', '-').toJSON());
    return;
  }
  res.json({ deleted: true, id: req.params.id });
});

/** POST /scheduler/tasks/:id/toggle — enable/disable */
router.post('/tasks/:id/toggle', (req: any, res: Response) => {
  const scheduler = getScheduler();
  const task = scheduler.toggleSchedule(req.params.id);
  if (!task) {
    res.status(404).json(notFound('SCHEDULE_NOT_FOUND', 'Scheduled task not found', '-').toJSON());
    return;
  }
  res.json(task);
});

/** POST /scheduler/tasks/:id/run — trigger immediately */
router.post('/tasks/:id/run', async (req: any, res: Response, next: NextFunction) => {
  try {
    const scheduler = getScheduler();
    const task = await scheduler.runNow(req.params.id);
    if (!task) {
      res.status(404).json(notFound('SCHEDULE_NOT_FOUND', 'Scheduled task not found', '-').toJSON());
      return;
    }
    res.json(task);
  } catch (err) { next(err); }
});

export default router;
