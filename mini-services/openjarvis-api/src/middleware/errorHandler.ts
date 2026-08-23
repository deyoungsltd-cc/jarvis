import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Global error handler — guarantees every error response follows the
 * structured format: { error: { code, message, requestId } }
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as any).requestId as string || '-';

  if (err instanceof AppError) {
    logger.error(requestId, `Operational error: ${err.code} — ${err.message}`);
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  // Unexpected error
  logger.error(requestId, `Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  });
}
