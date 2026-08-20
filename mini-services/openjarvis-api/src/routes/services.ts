/**
 * Phase 16 — Service Management Routes
 *
 * REST API for the Sovereign Stack dashboard and mobile access.
 * All endpoints require admin auth (applied in index.ts).
 */
import { Router, Request, Response, NextFunction } from 'express';
import { serviceManager } from '../services/serviceManager.js';
import { logger } from '../utils/logger.js';

const router = Router();

// =================================================================
// List all services
// =================================================================

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const { group, status, enabled } = req.query;

    const filters: { group?: string; status?: string; enabled?: boolean } = {};
    if (group) filters.group = String(group);
    if (status) filters.status = String(status);
    if (enabled !== undefined) filters.enabled = enabled === 'true';

    const services = await serviceManager.list(filters, requestId);
    res.json({ data: services, total: services.length });
  } catch (err) { next(err); }
});

// =================================================================
// Resource report (go/no-go analysis)
// =================================================================

router.get('/resources', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const report = await serviceManager.getResourceReport(requestId);
    res.json(report);
  } catch (err) { next(err); }
});

// =================================================================
// Get single service
// =================================================================

router.get('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const service = await serviceManager.getByName(req.params.name, requestId);
    res.json({ data: service });
  } catch (err) { next(err); }
});

// =================================================================
// Deploy a service
// =================================================================

router.post('/:name/deploy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const { missionId } = req.body;
    const result = await serviceManager.deploy(req.params.name, { missionId, requestId });
    res.json({ data: result });
  } catch (err) { next(err); }
});

// =================================================================
// Update a service (staged)
// =================================================================

router.post('/:name/update', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const { missionId, newImageTag } = req.body;
    const result = await serviceManager.update(req.params.name, { missionId, newImageTag, requestId });
    res.json({ data: result });
  } catch (err) { next(err); }
});

// =================================================================
// Restart a service
// =================================================================

router.post('/:name/restart', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const { missionId } = req.body;
    const result = await serviceManager.restart(req.params.name, { missionId, requestId });
    res.json({ data: result });
  } catch (err) { next(err); }
});

// =================================================================
// Stop a service
// =================================================================

router.post('/:name/stop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const { missionId } = req.body;
    const result = await serviceManager.stop(req.params.name, { missionId, requestId });
    res.json({ data: result });
  } catch (err) { next(err); }
});

// =================================================================
// Rollback a service
// =================================================================

router.post('/:name/rollback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const { missionId } = req.body;
    const result = await serviceManager.rollback(req.params.name, { missionId, requestId });
    res.json({ data: result });
  } catch (err) { next(err); }
});

// =================================================================
// Health check — single service
// =================================================================

router.get('/:name/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const result = await serviceManager.checkHealth(req.params.name, requestId);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// =================================================================
// Health check — all services
// =================================================================

router.post('/health-check/all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const result = await serviceManager.checkAllHealth(requestId);
    res.json(result);
  } catch (err) { next(err); }
});

// =================================================================
// Backup — create
// =================================================================

router.post('/:name/backup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const { missionId, scheduleType } = req.body;
    const result = await serviceManager.backup(req.params.name, { missionId, scheduleType, requestId });
    res.json({ data: result });
  } catch (err) { next(err); }
});

// =================================================================
// Backup — list
// =================================================================

router.get('/:name/backups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const backups = await serviceManager.listBackups(req.params.name, requestId);
    res.json({ data: backups, total: backups.length });
  } catch (err) { next(err); }
});

// =================================================================
// Backup — list all (across services)
// =================================================================

router.get('/backups/all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const backups = await serviceManager.listBackups(undefined, requestId);
    res.json({ data: backups, total: backups.length });
  } catch (err) { next(err); }
});

// =================================================================
// Restore from backup
// =================================================================

router.post('/backups/:backupId/restore', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId || '-';
    const { missionId } = req.body;
    const result = await serviceManager.restore(req.params.backupId, { missionId, requestId });
    res.json({ data: result });
  } catch (err) { next(err); }
});

export default router;
