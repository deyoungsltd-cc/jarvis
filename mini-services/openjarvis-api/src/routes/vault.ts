/**
 * Vault Routes — encrypted secret storage endpoints.
 */
import { Router, Request, Response } from 'express';
import { storeSecret, getSecret, listSecretKeys, deleteSecret } from '../utils/secretVault.js';
import { badRequest, notFound, internalError } from '../utils/errors.js';

const router = Router();

/** POST /vault/secrets — store a new secret */
router.post('/secrets', (req: Request, res: Response) => {
  const requestId = (req as Record<string, unknown>).requestId as string || '-';

  const { key, value } = req.body;
  if (!key || typeof key !== 'string') {
    return res.status(400).json(badRequest('VAULT_MISSING_KEY', '"key" field is required', requestId).toJSON());
  }
  if (value === undefined || value === null || typeof value !== 'string') {
    return res.status(400).json(badRequest('VAULT_MISSING_VALUE', '"value" field is required and must be a string', requestId).toJSON());
  }

  try {
    storeSecret(key, value);
    res.status(201).json({ key, status: 'stored', requestId });
  } catch (err: any) {
    res.status(500).json(internalError('VAULT_STORE_ERROR', err.message, requestId).toJSON());
  }
});

/** GET /vault/secrets — list all secret key names */
router.get('/secrets', (_req: Request, res: Response) => {
  const requestId = (_req as Record<string, unknown>).requestId as string || '-';

  try {
    const keys = listSecretKeys();
    res.json({ keys, count: keys.length, requestId });
  } catch (err: any) {
    res.status(500).json(internalError('VAULT_LIST_ERROR', err.message, requestId).toJSON());
  }
});

/** GET /vault/secrets/:key — retrieve and decrypt a secret */
router.get('/secrets/:key', (req: Request, res: Response) => {
  const requestId = (req as Record<string, unknown>).requestId as string || '-';
  const keyName = req.params.key;

  if (!keyName) {
    return res.status(400).json(badRequest('VAULT_MISSING_KEY', 'Secret key is required', requestId).toJSON());
  }

  try {
    const value = getSecret(keyName);
    if (value === null) {
      return res.status(404).json(notFound('VAULT_NOT_FOUND', `Secret '${keyName}' not found`, requestId).toJSON());
    }
    res.json({ key: keyName, value, requestId });
  } catch (err: any) {
    res.status(500).json(internalError('VAULT_GET_ERROR', err.message, requestId).toJSON());
  }
});

/** DELETE /vault/secrets/:key — delete a secret */
router.delete('/secrets/:key', (req: Request, res: Response) => {
  const requestId = (req as Record<string, unknown>).requestId as string || '-';
  const keyName = req.params.key;

  if (!keyName) {
    return res.status(400).json(badRequest('VAULT_MISSING_KEY', 'Secret key is required', requestId).toJSON());
  }

  try {
    const deleted = deleteSecret(keyName);
    if (!deleted) {
      return res.status(404).json(notFound('VAULT_NOT_FOUND', `Secret '${keyName}' not found`, requestId).toJSON());
    }
    res.json({ key: keyName, status: 'deleted', requestId });
  } catch (err: any) {
    res.status(500).json(internalError('VAULT_DELETE_ERROR', err.message, requestId).toJSON());
  }
});

export default router;
