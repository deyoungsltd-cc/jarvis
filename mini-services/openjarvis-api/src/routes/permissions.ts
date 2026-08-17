import { Router, Request, Response, NextFunction } from 'express';
import { getPermissionManager } from '../agent/permissions/permissionManager.js';
import { badRequest } from '../utils/errors.js';

const router = Router();

/** GET /permissions — list all capabilities with grant status */
router.get('/', (_req: Request, res: Response) => {
  const pm = getPermissionManager();
  res.json(pm.getAllCapabilities());
});

/** POST /permissions/grant — grant a capability */
router.post('/grant', (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { capability, scope, missionId } = req.body;
    if (!capability || typeof capability !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'capability is required', requestId);
    }
    const pm = getPermissionManager();
    pm.grant(capability, { scope, missionId });
    res.json({ granted: true, capability });
  } catch (err) { next(err); }
});

/** POST /permissions/revoke — revoke a capability */
router.post('/revoke', (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { capability } = req.body;
    if (!capability || typeof capability !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'capability is required', requestId);
    }
    const pm = getPermissionManager();
    pm.revoke(capability);
    res.json({ granted: false, capability });
  } catch (err) { next(err); }
});

export default router;
