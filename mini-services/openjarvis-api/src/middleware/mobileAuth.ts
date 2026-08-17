/**
 * Mobile Auth Middleware — Phase 7
 *
 * Validates API key from X-API-Key header or ?api_key query param.
 * Attaches `mobileClient` to the request when valid.
 * Returns 401 for missing/invalid keys.
 */
import { Request, Response, NextFunction } from 'express';
import { mobileClientService } from '../services/mobileClientService.js';
import { unauthorized } from '../utils/errors.js';

export interface MobileAuthRequest extends Request {
  mobileClient?: {
    id: string;
    name: string;
    platform: string;
  };
}

/**
 * Middleware: require a valid mobile API key.
 * Pass `true` to make auth optional (attach client if present, don't reject).
 */
export function requireMobileAuth(optional = false) {
  return async (req: MobileAuthRequest, res: Response, next: NextFunction) => {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const apiKey = req.headers['x-api-key'] as string
      || (req.query.api_key as string);

    if (!apiKey) {
      if (optional) return next();
      return res.status(401).json(unauthorized('AUTH_REQUIRED', 'X-API-Key header or api_key query param required', requestId).toJSON());
    }

    try {
      const client = await mobileClientService.authenticate(apiKey);
      if (!client) {
        if (optional) return next();
        return res.status(401).json(unauthorized('AUTH_INVALID', 'Invalid or disabled API key', requestId).toJSON());
      }
      req.mobileClient = {
        id: client.id,
        name: client.name,
        platform: client.platform,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
