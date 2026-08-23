import { Router, Request, Response, NextFunction } from 'express';
import { capabilityRegistry } from '../services/capabilityRegistry.js';
import { badRequest } from '../utils/errors.js';

const router = Router();

/** GET /permissions — list all capabilities with their grant status */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (_req as any).requestId as string;
    const statuses = await capabilityRegistry.getAllStatuses(requestId);

    // Merge with the full capability list for complete view
    const allCapabilities = [
      'screenshot', 'mouse_move', 'mouse_click', 'mouse_scroll',
      'key_type', 'key_press', 'clipboard_read', 'clipboard_write',
      'filesystem_read', 'filesystem_write', 'filesystem_delete',
      'shell_execute', 'app_launch', 'app_close',
      'window_list', 'window_focus', 'window_info',
    ];

    const riskMap: Record<string, string> = {
      screenshot: 'low', mouse_move: 'medium', mouse_click: 'high', mouse_scroll: 'low',
      key_type: 'high', key_press: 'medium', clipboard_read: 'medium', clipboard_write: 'high',
      filesystem_read: 'low', filesystem_write: 'medium', filesystem_delete: 'critical',
      shell_execute: 'critical', app_launch: 'medium', app_close: 'high',
      window_list: 'low', window_focus: 'medium', window_info: 'low',
    };

    const result = allCapabilities.map(cap => {
      const entry = statuses[cap];
      return {
        capability: cap,
        status: entry?.status || 'undefined',
        risk: riskMap[cap] || 'low',
        grantId: entry?.grantId,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

/** POST /permissions/grant — grant a capability */
router.post('/grant', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId as string;
    const { capability, allowed = true, scope, scopeContext, missionId } = req.body;
    if (!capability || typeof capability !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'capability is required', requestId);
    }
    const grant = await capabilityRegistry.grant({
      capability,
      allowed,
      scopeType: scope || 'permanent',
      scopeContext,
      missionId,
      source: 'manual',
    }, requestId);
    res.json({ granted: grant.allowed, capability: grant.capability });
  } catch (err) { next(err); }
});

/** POST /permissions/revoke — revoke all grants for a capability */
router.post('/revoke', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId as string;
    const { capability } = req.body;
    if (!capability || typeof capability !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'capability is required', requestId);
    }
    const result = await capabilityRegistry.revokeAll(capability, requestId);
    res.json({ granted: false, capability: result.capability });
  } catch (err) { next(err); }
});

export default router;
