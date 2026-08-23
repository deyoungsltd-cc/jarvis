import { Router, Request, Response } from 'express';
import { checkDbConnection } from '../utils/db.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const requestId = (_req as any).requestId as string || '-';

  const dbStatus = await checkDbConnection();

  const healthy = dbStatus.alive;
  const statusCode = healthy ? 200 : 503;

  res.status(statusCode).json({
    status: healthy ? 'healthy' : 'unhealthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: {
      connected: dbStatus.alive,
      latencyMs: dbStatus.latencyMs,
      ...(dbStatus.error ? { error: dbStatus.error } : {}),
    },
    process: {
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: process.memoryUsage(),
    },
    requestId,
  });
});

export default router;
