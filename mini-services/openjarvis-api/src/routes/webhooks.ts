/**
 * Webhook Routes — Round 2
 *
 * Manage webhook integrations for Discord, Slack, and Telegram.
 */
import { Router, Response, NextFunction } from 'express';
import { getWebhookService } from '../services/webhookService.js';
import { badRequest } from '../utils/errors.js';
import type { WebhookType } from '../services/webhookService.js';

const router = Router();

/** GET /webhooks — list all webhooks */
router.get('/', (_req: any, res: Response) => {
  const service = getWebhookService();
  const webhooks = service.listWebhooks();
  res.json({ webhooks, count: webhooks.length });
});

/** POST /webhooks — add a webhook */
router.post('/', (req: any, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId as string;
    const { name, type, url, chatId, enabled } = req.body;

    if (!name || typeof name !== 'string') {
      throw badRequest('VALIDATION_ERROR', '"name" is required', requestId);
    }
    if (!type || !['discord', 'slack', 'telegram'].includes(type)) {
      throw badRequest('VALIDATION_ERROR', '"type" must be discord, slack, or telegram', requestId);
    }
    if (!url || typeof url !== 'string') {
      throw badRequest('VALIDATION_ERROR', '"url" is required (webhook URL or bot token for Telegram)', requestId);
    }
    if (type === 'telegram' && (!chatId || typeof chatId !== 'string')) {
      throw badRequest('VALIDATION_ERROR', '"chatId" is required for Telegram webhooks', requestId);
    }

    const service = getWebhookService();
    const webhook = service.addWebhook({
      name,
      type: type as WebhookType,
      url,
      chatId,
      enabled,
    });

    res.status(201).json(webhook);
  } catch (err) { next(err); }
});

/** DELETE /webhooks/:id — remove a webhook */
router.delete('/:id', (req: any, res: Response) => {
  const service = getWebhookService();
  const removed = service.removeWebhook(req.params.id);
  if (!removed) {
    res.status(404).json({
      error: { code: 'WEBHOOK_NOT_FOUND', message: 'Webhook not found', requestId: '-' },
    });
    return;
  }
  res.json({ deleted: true, id: req.params.id });
});

/** POST /webhooks/:id/test — send test message */
router.post('/:id/test', async (req: any, res: Response, next: NextFunction) => {
  try {
    const service = getWebhookService();
    const result = await service.testWebhook(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

/** POST /webhooks/broadcast — send message to all active webhooks */
router.post('/broadcast', async (req: any, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId as string;
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      throw badRequest('VALIDATION_ERROR', '"message" is required', requestId);
    }

    const service = getWebhookService();
    const results = await service.broadcast(message);

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      total: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (err) { next(err); }
});

export default router;
