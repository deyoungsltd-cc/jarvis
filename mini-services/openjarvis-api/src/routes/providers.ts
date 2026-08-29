/**
 * Phase 14 — Provider Management Routes
 */
import { Router, Request, Response, NextFunction } from 'express';
import { providerManager } from '../providers/providerManager.js';

const router = Router();

/** GET /providers/status — provider status overview */
router.get('/status', async (_req, res, next) => {
  try {
    const overview = await providerManager.getStatusOverview();
    res.json(overview);
  } catch (err) { next(err); }
});

/** GET /providers/tier — get active cost tier */
router.get('/tier', async (_req, res, next) => {
  try {
    const tier = await providerManager.getActiveTier();
    res.json(tier);
  } catch (err) { next(err); }
});

/** PUT /providers/tier — set active cost tier (admin action, logged) */
router.put('/tier', async (req, res, next) => {
  try {
    const { tier } = req.body;
    if (!tier) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '"tier" is required' } });
      return;
    }
    const updated = await providerManager.setActiveTier(tier);
    res.json(updated);
  } catch (err) { next(err); }
});

/** GET /providers/tiers — list all cost tiers */
router.get('/tiers', async (_req, res, next) => {
  try {
    const tiers = await (await import('../utils/db.js')).db.costTier.findMany({ orderBy: { name: 'asc' } });
    res.json(tiers);
  } catch (err) { next(err); }
});

/** GET /providers/routing/:capability — get routing preferences */
router.get('/routing/:capability', async (req, res, next) => {
  try {
    const prefs = await providerManager.getRoutingPreferences(req.params.capability);
    res.json(prefs);
  } catch (err) { next(err); }
});

/** POST /providers/reset-degraded — reset rate-limited providers */
router.post('/reset-degraded', async (req, res, next) => {
  try {
    const result = await providerManager.resetDegradedStatus(req.body.capability);
    res.json(result);
  } catch (err) { next(err); }
});

/** GET /providers/usage — get recent usage logs */
router.get('/usage', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const db = (await import('../utils/db.js')).db;
    const logs = await db.providerUsageLog.findMany({
      orderBy: { createdAt: 'desc' }, take: limit,
    });
    res.json(logs);
  } catch (err) { next(err); }
});

export default router;
