/**
 * Approval Workflow Routes — Phase 10
 *
 * REST API for managing approval requests and rules.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { approvalService } from '../services/approvalService.js';
import { badRequest, notFound } from '../utils/errors.js';

const router = Router();

// =================================================================
// Approval Requests
// =================================================================

/** GET /approvals — list approval requests with optional filters */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const result = await approvalService.list({
      missionId: req.query.missionId as string,
      status: req.query.status as any,
      riskLevel: req.query.riskLevel as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    }, requestId);
    res.json(result);
  } catch (err) { next(err); }
});

/** GET /approvals/stats — approval statistics */
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await approvalService.getStats();
    res.json(stats);
  } catch (err) { next(err); }
});

/** GET /approvals/pending — get all pending requests */
router.get('/pending', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const result = await approvalService.list({ status: 'pending' }, requestId);
    res.json(result);
  } catch (err) { next(err); }
});

/** GET /approvals/expire — expire stale pending requests */
router.post('/expire', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const count = await approvalService.expirePending(requestId);
    res.json({ expired: count });
  } catch (err) { next(err); }
});

/** GET /approvals/:id — get a single approval request */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const request = await approvalService.getById(req.params.id, requestId);
    res.json(request);
  } catch (err) { next(err); }
});

/** POST /approvals/:id/approve — approve a pending request */
router.post('/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { resolvedBy = 'user', response } = req.body;
    const result = await approvalService.approve(req.params.id, resolvedBy, response, requestId);
    res.json(result);
  } catch (err) { next(err); }
});

/** POST /approvals/:id/reject — reject a pending request */
router.post('/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { resolvedBy = 'user', response } = req.body;
    const result = await approvalService.reject(req.params.id, resolvedBy, response, requestId);
    res.json(result);
  } catch (err) { next(err); }
});

/** POST /approvals/:id/cancel — cancel a pending request */
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const result = await approvalService.cancel(req.params.id, requestId);
    res.json(result);
  } catch (err) { next(err); }
});

// =================================================================
// Approval Rules
// =================================================================

/** GET /approvals/rules — list all approval rules */
router.get('/rules', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rules = await approvalService.listRules();
    res.json(rules);
  } catch (err) { next(err); }
});

/** POST /approvals/rules — create a new approval rule */
router.post('/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { name, description, enabled, matchRiskLevels, matchToolNames, matchCapabilities, action, priority } = req.body;
    if (!name || !action) {
      throw badRequest('VALIDATION_ERROR', 'name and action are required', requestId);
    }
    const rule = await approvalService.createRule({
      name,
      description,
      enabled,
      matchRiskLevels,
      matchToolNames,
      matchCapabilities,
      action,
      priority,
    }, requestId);
    res.status(201).json(rule);
  } catch (err) { next(err); }
});

/** GET /approvals/rules/:id — get a single rule */
router.get('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const rule = await approvalService.getRule(req.params.id, requestId);
    res.json(rule);
  } catch (err) { next(err); }
});

/** PATCH /approvals/rules/:id — update a rule */
router.patch('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const rule = await approvalService.updateRule(req.params.id, req.body, requestId);
    res.json(rule);
  } catch (err) { next(err); }
});

/** DELETE /approvals/rules/:id — delete a rule */
router.delete('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    await approvalService.deleteRule(req.params.id, requestId);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

export default router;
