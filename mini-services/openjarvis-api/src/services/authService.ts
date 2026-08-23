/**
 * Auth Service — JWT token management using Node.js built-in crypto (HMAC-SHA256).
 *
 * No external JWT library. Tokens are base64url-encoded JSON.
 *
 * - Access token TTL: 1 hour
 * - Refresh token TTL: 30 days
 * - Payload: { clientId, platform, name, iat, exp }
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCESS_TOKEN_TTL = 60 * 60;          // 1 hour in seconds
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

/** HMAC secret — derived from a stable env var or a random fallback */
function getHmacSecret(): Buffer {
  // Use a dedicated env var if available, otherwise generate a stable one
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.length >= 32) {
    return Buffer.from(envSecret, 'utf-8');
  }
  // Derive from hostname + app name so it's stable across restarts but unique per host
  const fallback = `openjarvis-jwt-${process.env.PORT || 3001}-${process.cwd()}`;
  return crypto.createHash('sha256').update(fallback).digest();
}

// ---------------------------------------------------------------------------
// Base64URL helpers
// ---------------------------------------------------------------------------

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Buffer {
  let padded = str.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4 !== 0) padded += '=';
  return Buffer.from(padded, 'base64');
}

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

export interface JwtPayload {
  clientId: string;
  platform?: string;
  name?: string;
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ---------------------------------------------------------------------------
// Revocation store (in-memory)
// ---------------------------------------------------------------------------

const revokedTokens = new Set<string>();

// Periodically clean up expired revoked tokens to prevent memory leaks
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const token of revokedTokens) {
    try {
      const payload = decodeUnverified(token);
      if (payload && payload.exp < now) {
        revokedTokens.delete(token);
      }
    } catch {
      revokedTokens.delete(token);
    }
  }
}, 60 * 60 * 1000).unref(); // every hour

// ---------------------------------------------------------------------------
// Core JWT implementation
// ---------------------------------------------------------------------------

/** Create HMAC-SHA256 signature for header + payload */
function sign(headerB64: string, payloadB64: string): string {
  const secret = getHmacSecret();
  const signature = crypto.createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  return base64urlEncode(signature);
}

/** Decode a token without verification (for inspection/cleanup) */
function decodeUnverified(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payloadBuf = base64urlDecode(parts[1]);
    return JSON.parse(payloadBuf.toString('utf-8'));
  } catch {
    return null;
  }
}

/** Build a signed JWT string from payload */
function buildToken(payload: JwtPayload): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64urlEncode(Buffer.from(JSON.stringify(header), 'utf-8'));
  const payloadB64 = base64urlEncode(Buffer.from(JSON.stringify(payload), 'utf-8'));
  const sig = sign(headerB64, payloadB64);
  return `${headerB64}.${payloadB64}.${sig}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Generate a JWT access token */
export function generateAccessToken(clientId: string, platform: string, name: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    clientId,
    platform,
    name,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL,
    type: 'access',
  };
  return buildToken(payload);
}

/** Generate a JWT refresh token */
export function generateRefreshToken(clientId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    clientId,
    iat: now,
    exp: now + REFRESH_TOKEN_TTL,
    type: 'refresh',
  };
  return buildToken(payload);
}

/** Generate both tokens at once */
export function generateTokenPair(clientId: string, platform: string, name: string): TokenPair {
  return {
    accessToken: generateAccessToken(clientId, platform, name),
    refreshToken: generateRefreshToken(clientId),
    expiresIn: ACCESS_TOKEN_TTL,
  };
}

/** Verify a JWT and return its payload, or null if invalid */
export function verifyToken(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;

  // Re-compute signature
  const expectedSig = sign(headerB64, payloadB64);
  if (!crypto.timingSafeEqual(Buffer.from(sigB64), Buffer.from(expectedSig))) {
    return null;
  }

  // Decode payload
  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf-8'));
  } catch {
    return null;
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  // Check revocation
  if (revokedTokens.has(token)) return null;

  return payload;
}

/** Exchange a valid refresh token for a new access token */
export function refreshAccessToken(refreshToken: string): { accessToken: string; expiresIn: number } | null {
  const payload = verifyToken(refreshToken);
  if (!payload || payload.type !== 'refresh') return null;

  // Revoke the old refresh token
  revokedTokens.add(refreshToken);

  // Issue new access token
  const accessToken = generateAccessToken(
    payload.clientId,
    payload.platform || '',
    payload.name || '',
  );

  return { accessToken, expiresIn: ACCESS_TOKEN_TTL };
}

/** Revoke a token so it can no longer be used */
export function revokeToken(token: string): boolean {
  const payload = decodeUnverified(token);
  if (!payload) return false;

  revokedTokens.add(token);
  logger.info('-', `Token revoked for client ${payload.clientId}`);
  return true;
}

/** Check if a token has been revoked */
export function isRevoked(token: string): boolean {
  return revokedTokens.has(token);
}
