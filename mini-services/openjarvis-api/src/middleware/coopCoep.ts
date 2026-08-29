/**
 * Phase 13 — COOP/COEP Headers Middleware
 *
 * Porcupine Web SDK requires SharedArrayBuffer, which in turn requires
 * Cross-Origin-Opener-Policy: same-origin and
 * Cross-Origin-Embedder-Policy: require-corp
 * on the HTTP response headers.
 *
 * This middleware sets these headers when Porcupine wake word engine is active.
 * When not active, headers are set to permissive defaults to avoid
 * breaking cross-origin resource loading (images, scripts, etc.).
 */
import { Request, Response, NextFunction } from 'express';
import { wakeWordService } from '../ambient/wakeWordService.js';

export function coopCoepHeaders(req: Request, res: Response, next: NextFunction) {
  const config = wakeWordService.getConfig();

  if (config.engine === 'porcupine') {
    // Porcupine needs SharedArrayBuffer
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  } else {
    // Permissive defaults — don't break other resources
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  }

  next();
}
