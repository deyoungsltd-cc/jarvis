/**
 * Admin Authentication Middleware
 *
 * Single-user admin auth for protecting all core API routes.
 * Uses Bearer token or session cookie (Authorization: Bearer <token>).
 * On first startup with no admin user, generates a one-time setup token.
 */
import { Request, Response, NextFunction } from 'express';
import { db } from '../utils/db.js';
import { unauthorized } from '../utils/errors.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

const BCRYPT_ROUNDS = 12;
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/** In-memory session store (single-user, resets on restart) */
const activeSessions = new Map<string, { createdAt: number }>();

export interface AdminAuthRequest extends Request {
  adminId?: string;
}

/**
 * Ensure an admin user exists. Called at server startup.
 * If no admin exists, create one with a one-time setup token.
 */
export async function ensureAdminUser(): Promise<{ needsSetup: boolean; setupToken?: string }> {
  let admin = await db.adminUser.findFirst();

  if (!admin) {
    const setupToken = uuidv4();
    const setupTokenExp = new Date(Date.now() + SESSION_DURATION_MS);

    admin = await db.adminUser.create({
      data: {
        passwordHash: '', // not set yet
        setupToken,
        setupTokenExp,
      },
    });

    logger.warn('AUTH', `No admin user found. One-time setup token generated. Use POST /auth/setup to set your password.`);
    logger.warn('AUTH', `Setup token: ${setupToken} (expires in 24h)`);
    return { needsSetup: true, setupToken };
  }

  return { needsSetup: false };
}

/**
 * Middleware: require admin authentication via Bearer token.
 * Pass `true` to make auth optional (attach admin if present, don't reject).
 */
export function requireAdminAuth(optional = false) {
  return async (req: AdminAuthRequest, res: Response, next: NextFunction) => {
    const requestId = (req as Record<string, unknown>).requestId as string || '-';

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (optional) return next();
      return res.status(401).json(unauthorized('AUTH_REQUIRED', 'Authorization: Bearer <token> required', requestId).toJSON());
    }

    const token = authHeader.slice(7);

    // Check session store
    const session = activeSessions.get(token);
    if (!session) {
      if (optional) return next();
      return res.status(401).json(unauthorized('AUTH_INVALID', 'Invalid or expired session token', requestId).toJSON());
    }

    // Check session expiry
    if (Date.now() - session.createdAt > SESSION_DURATION_MS) {
      activeSessions.delete(token);
      if (optional) return next();
      return res.status(401).json(unauthorized('AUTH_EXPIRED', 'Session expired. Please log in again.', requestId).toJSON());
    }

    // Verify admin still exists
    const admin = await db.adminUser.findFirst();
    if (!admin) {
      activeSessions.delete(token);
      if (optional) return next();
      return res.status(401).json(unauthorized('AUTH_NO_ADMIN', 'No admin user configured', requestId).toJSON());
    }

    req.adminId = admin.id;
    next();
  };
}

/**
 * Set up admin password using one-time setup token.
 * Returns a session token on success.
 */
export async function setupAdminPassword(setupToken: string, password: string): Promise<string> {
  const admin = await db.adminUser.findFirst({
    where: { setupToken },
  });

  if (!admin) {
    throw new Error('Invalid or expired setup token');
  }

  if (admin.setupTokenExp && admin.setupTokenExp < new Date()) {
    throw new Error('Setup token has expired. Restart the server to generate a new one.');
  }

  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await db.adminUser.update({
    where: { id: admin.id },
    data: {
      passwordHash,
      setupToken: null,
      setupTokenExp: null,
    },
  });

  logger.info('AUTH', 'Admin password set successfully. Setup token consumed.');

  // Create a session token
  const sessionToken = uuidv4();
  activeSessions.set(sessionToken, { createdAt: Date.now() });

  return sessionToken;
}

/**
 * Log in with username/password.
 * Returns a session token on success.
 */
export async function loginAdmin(username: string, password: string): Promise<string> {
  const admin = await db.adminUser.findFirst({ where: { username } });

  if (!admin || !admin.passwordHash) {
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  await db.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  const sessionToken = uuidv4();
  activeSessions.set(sessionToken, { createdAt: Date.now() });

  logger.info('AUTH', `Admin logged in successfully (id: ${admin.id})`);

  return sessionToken;
}

/**
 * Invalidate a session token (logout).
 */
export function logoutAdmin(token: string): boolean {
  return activeSessions.delete(token);
}

/**
 * Check if admin setup is needed (no password set yet).
 */
export async function isSetupNeeded(): Promise<boolean> {
  const admin = await db.adminUser.findFirst();
  return !admin || !admin.passwordHash;
}
