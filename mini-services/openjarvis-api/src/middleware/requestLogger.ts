import { Request, Response, NextFunction } from 'express';
import { createRequestId, logger } from '../utils/logger.js';

/**
 * Attaches a `requestId` to every request, logs start/end, and exposes
 * it on `req.requestId` for downstream handlers.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || createRequestId();
  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = Date.now();
  logger.info(requestId, `>> ${req.method} ${req.originalUrl}`);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](requestId, `<< ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });

  next();
}
