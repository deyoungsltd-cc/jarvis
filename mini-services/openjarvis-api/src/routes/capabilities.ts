/**
 * Capability Grants Routes — Authorization Model
 *
 * REST API for the admin to manage the capability registry.
 * "The admin is the policy" — these endpoints are the admin's control surface.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { capabilityRegistry } from '../services/capabilityRegistry.js';
import { badRequest } from '../utils/errors.js';

const router = Router();

// =================================================================
// Capability Grants CRUD
// =================================================================

/** GET /capabilities/grants — list all capability grants */
router.get('/grants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const result = await capabilityRegistry.list({
      capability: req.query.capability as string,
      allowed: req.query.allowed !== undefined ? req.query.allowed === 'true' : undefined,
      scopeType: req.query.scopeType as any,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    }, requestId);
    res.json(result);
  } catch (err) { next(err); }
});

/** GET /capabilities/statuses — get current authorization status for all capabilities */
router.get('/statuses', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const statuses = await capabilityRegistry.getAllStatuses(requestId);
    res.json(statuses);
  } catch (err) { next(err); }
});

/** POST /capabilities/grants — create a capability grant */
router.post('/grants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { capability, allowed, scopeType, scopeContext, missionId } = req.body;
    if (!capability || typeof capability !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'capability is required', requestId);
    }
    if (allowed === undefined || typeof allowed !== 'boolean') {
      throw badRequest('VALIDATION_ERROR', 'allowed (boolean) is required', requestId);
    }
    const grant = await capabilityRegistry.grant({
      capability,
      allowed,
      scopeType,
      scopeContext,
      missionId,
      source: 'manual',
    }, requestId);
    res.status(201).json(grant);
  } catch (err) { next(err); }
});

/** GET /capabilities/grants/:id — get a single grant */
router.get('/grants/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const grant = await capabilityRegistry.getById(req.params.id, requestId);
    res.json(grant);
  } catch (err) { next(err); }
});

/** PATCH /capabilities/grants/:id — update a grant */
router.patch('/grants/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { allowed, scopeType, scopeContext } = req.body;
    const grant = await capabilityRegistry.update(req.params.id, {
      allowed,
      scopeType,
      scopeContext,
    }, requestId);
    res.json(grant);
  } catch (err) { next(err); }
});

/** DELETE /capabilities/grants/:id — revoke a specific grant */
router.delete('/grants/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const result = await capabilityRegistry.revoke(req.params.id, requestId);
    res.json(result);
  } catch (err) { next(err); }
});

/** DELETE /capabilities/grants/:capability/revoke-all — revoke ALL grants for a capability */
router.delete('/grants/:capability/revoke-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const result = await capabilityRegistry.revokeAll(req.params.capability, requestId);
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
