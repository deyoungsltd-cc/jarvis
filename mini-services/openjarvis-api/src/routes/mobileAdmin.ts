/**
 * Mobile Admin Routes — Phase 7
 *
 * Admin endpoints for managing mobile clients.
 * These are under /mobile/admin/ and do not require mobile auth.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { mobileClientService } from '../services/mobileClientService.js';
import { badRequest, notFound } from '../utils/errors.js';

const router = Router();

/** GET /mobile/admin/clients — list all clients */
router.get('/clients', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const clients = await mobileClientService.list();
    // Don't expose full API keys in listing
    res.json(clients.map(c => ({
      ...c,
      apiKey: c.apiKey.substring(0, 8) + '...',
    })));
  } catch (err) { next(err); }
});

/** POST /mobile/admin/clients/:id/revoke — disable a client */
router.post('/clients/:id/revoke', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await mobileClientService.revoke(req.params.id);
    res.json({ id: client.id, name: client.name, enabled: client.enabled });
  } catch (err) { next(err); }
});

/** POST /mobile/admin/clients/:id/enable — re-enable a client */
router.post('/clients/:id/enable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await mobileClientService.enable(req.params.id);
    res.json({ id: client.id, name: client.name, enabled: client.enabled });
  } catch (err) { next(err); }
});

/** POST /mobile/admin/clients/:id/regenerate — regenerate API key */
router.post('/clients/:id/regenerate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await mobileClientService.regenerateApiKey(req.params.id);
    res.json({
      id: result.id,
      name: result.name,
      apiKey: result.apiKey,
    });
  } catch (err) { next(err); }
});

/** DELETE /mobile/admin/clients/:id — delete a client */
router.delete('/clients/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await mobileClientService.remove(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
