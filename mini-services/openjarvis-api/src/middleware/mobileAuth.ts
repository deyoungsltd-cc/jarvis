/**
 * Mobile Auth Middleware — Phase 7 (extended with JWT)
 *
 * Supports two auth methods:
 * 1. API key via X-API-Key header or ?api_key query param (original)
 * 2. JWT Bearer token via Authorization: Bearer <token>
 *
 * Attaches `mobileClient` to the request when valid.
 * Returns 401 for missing/invalid credentials.
 */
import { Request, Response, NextFunction } from 'express';
import { mobileClientService } from '../services/mobileClientService.js';
import { verifyToken } from '../services/authService.js';
import { unauthorized } from '../utils/errors.js';

export interface MobileAuthRequest extends Request {
  mobileClient?: {
    id: string;
    name: string;
    platform: string;
  };
}

/**
 * Middleware: require a valid mobile API key (original behavior).
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

/**
 * Middleware: validate JWT from Authorization: Bearer <token> header.
 * Falls back to API key auth if no Bearer token is present.
 * This allows both auth methods to work seamlessly.
 *
 * Pass `true` to make auth optional (attach client if present, don't reject).
 */
export function jwtAuth(optional = false) {
  return async (req: MobileAuthRequest, res: Response, next: NextFunction) => {
    const requestId = (req as Record<string, unknown>).requestId as string;

    // --- Try JWT Bearer first ---
    const authHeader = req.headers.authorization as string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = verifyToken(token);

      if (payload && payload.type === 'access') {
        req.mobileClient = {
          id: payload.clientId,
          name: payload.name || '',
          platform: payload.platform || '',
        };
        return next();
      }

      // Bearer was present but invalid — reject (don't fall through to API key)
      if (!optional) {
        return res.status(401).json(
          unauthorized('AUTH_INVALID', 'JWT token is invalid, expired, or revoked', requestId).toJSON(),
        );
      }
      return next();
    }

    // --- Fallback: try API key ---
    const apiKey = req.headers['x-api-key'] as string
      || (req.query.api_key as string);

    if (!apiKey) {
      if (optional) return next();
      return res.status(401).json(
        unauthorized('AUTH_REQUIRED', 'Authorization: Bearer <token> or X-API-Key header required', requestId).toJSON(),
      );
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
