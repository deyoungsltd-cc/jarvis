/**
 * Auth Routes — JWT token exchange, refresh, revoke, and introspection.
 */
import { Router, Request, Response } from 'express';
import {
  generateTokenPair,
  verifyToken,
  refreshAccessToken,
  revokeToken,
} from '../services/authService.js';
import { mobileClientService } from '../services/mobileClientService.js';
import { badRequest, unauthorized } from '../utils/errors.js';

const router = Router();

/** POST /auth/token — exchange API key for JWT pair */
router.post('/token', async (req: Request, res: Response) => {
  const requestId = (req as Record<string, unknown>).requestId as string || '-';

  // Accept API key from header or body
  const apiKey = (req.headers['x-api-key'] as string)
    || req.body.apiKey
    || req.body.api_key;

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(401).json(
      unauthorized('AUTH_REQUIRED', 'API key required (X-API-Key header or apiKey in body)', requestId).toJSON(),
    );
  }

  try {
    const client = await mobileClientService.authenticate(apiKey);
    if (!client) {
      return res.status(401).json(
        unauthorized('AUTH_INVALID', 'Invalid or disabled API key', requestId).toJSON(),
      );
    }

    const tokens = generateTokenPair(client.id, client.platform, client.name);
    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer',
      client: {
        id: client.id,
        name: client.name,
        platform: client.platform,
      },
      requestId,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'AUTH_INTERNAL', message: err.message, requestId } });
  }
});

/** POST /auth/refresh — refresh access token using a refresh token */
router.post('/refresh', (req: Request, res: Response) => {
  const requestId = (req as Record<string, unknown>).requestId as string || '-';
  const { refreshToken } = req.body;

  if (!refreshToken || typeof refreshToken !== 'string') {
    return res.status(400).json(
      badRequest('AUTH_MISSING_REFRESH', 'refreshToken field is required', requestId).toJSON(),
    );
  }

  const result = refreshAccessToken(refreshToken);
  if (!result) {
    return res.status(401).json(
      unauthorized('AUTH_REFRESH_INVALID', 'Refresh token is invalid, expired, or revoked', requestId).toJSON(),
    );
  }

  res.json({
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    tokenType: 'Bearer',
    requestId,
  });
});

/** POST /auth/revoke — revoke a token */
router.post('/revoke', (req: Request, res: Response) => {
  const requestId = (req as Record<string, unknown>).requestId as string || '-';
  const { token } = req.body;

  if (!token || typeof token !== 'string') {
    return res.status(400).json(
      badRequest('AUTH_MISSING_TOKEN', 'token field is required', requestId).toJSON(),
    );
  }

  const ok = revokeToken(token);
  res.json({ revoked: ok, requestId });
});

/** GET /auth/me — inspect current token and return client info */
router.get('/me', (req: Request, res: Response) => {
  const requestId = (req as Record<string, unknown>).requestId as string || '-';

  // Try Bearer token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(
      unauthorized('AUTH_REQUIRED', 'Bearer token required', requestId).toJSON(),
    );
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json(
      unauthorized('AUTH_INVALID', 'Token is invalid, expired, or revoked', requestId).toJSON(),
    );
  }

  res.json({
    clientId: payload.clientId,
    platform: payload.platform || null,
    name: payload.name || null,
    type: payload.type,
    iat: payload.iat,
    exp: payload.exp,
    requestId,
  });
});

export default router;
