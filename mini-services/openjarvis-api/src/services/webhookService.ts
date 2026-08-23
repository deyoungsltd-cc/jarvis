/**
 * Webhook Service — Round 2
 *
 * Sends notifications to Discord, Slack, and Telegram webhooks.
 * Persists webhook configs to data/webhooks.json.
 */
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

// ---- Types ----

export type WebhookType = 'discord' | 'slack' | 'telegram';

export interface WebhookConfig {
  id: string;
  name: string;
  type: WebhookType;
  url: string;       // webhook URL (for Discord/Slack) or bot token (for Telegram)
  chatId?: string;   // Telegram chat_id
  enabled: boolean;
  createdAt: string;
}

export interface CreateWebhookOpts {
  name: string;
  type: WebhookType;
  url: string;
  chatId?: string;
  enabled?: boolean;
}

export interface SendResult {
  webhookId: string;
  webhookName: string;
  success: boolean;
  status?: number;
  error?: string;
}

// ---- Constants ----

const PERSIST_PATH = path.resolve(process.cwd(), 'data', 'webhooks.json');

// ---- Service ----

class WebhookService {
  private webhooks: Map<string, WebhookConfig> = new Map();

  constructor() {
    this.load();
  }

  // ---- Persistence ----

  private ensureDataDir() {
    const dir = path.dirname(PERSIST_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load() {
    try {
      if (fs.existsSync(PERSIST_PATH)) {
        const raw = fs.readFileSync(PERSIST_PATH, 'utf-8');
        const arr: WebhookConfig[] = JSON.parse(raw);
        for (const w of arr) {
          this.webhooks.set(w.id, w);
        }
        logger.info('webhooks', `Loaded ${arr.length} webhook configs`);
      }
    } catch (err) {
      logger.error('webhooks', `Failed to load webhooks: ${err}`);
    }
  }

  private save() {
    try {
      this.ensureDataDir();
      const arr = Array.from(this.webhooks.values());
      fs.writeFileSync(PERSIST_PATH, JSON.stringify(arr, null, 2));
    } catch (err) {
      logger.error('webhooks', `Failed to save webhooks: ${err}`);
    }
  }

  // ---- Send Logic ----

  private async sendToDiscord(webhook: WebhookConfig, message: string): Promise<SendResult> {
    try {
      const resp = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: message,
          username: 'OpenJarvis',
          avatar_url: 'https://z-cdn.chatglm.cn/z-ai/static/logo.svg',
        }),
      });
      return {
        webhookId: webhook.id,
        webhookName: webhook.name,
        success: resp.ok,
        status: resp.status,
        error: resp.ok ? undefined : `HTTP ${resp.status}`,
      };
    } catch (err) {
      return {
        webhookId: webhook.id,
        webhookName: webhook.name,
        success: false,
        error: String(err),
      };
    }
  }

  private async sendToSlack(webhook: WebhookConfig, message: string): Promise<SendResult> {
    try {
      const resp = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          username: 'OpenJarvis',
          icon_emoji: ':robot_face:',
        }),
      });
      return {
        webhookId: webhook.id,
        webhookName: webhook.name,
        success: resp.ok,
        status: resp.status,
        error: resp.ok ? undefined : `HTTP ${resp.status}`,
      };
    } catch (err) {
      return {
        webhookId: webhook.id,
        webhookName: webhook.name,
        success: false,
        error: String(err),
      };
    }
  }

  private async sendToTelegram(webhook: WebhookConfig, message: string): Promise<SendResult> {
    try {
      const token = webhook.url; // stored as bot token for Telegram
      const chatId = webhook.chatId || '';
      const apiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });
      return {
        webhookId: webhook.id,
        webhookName: webhook.name,
        success: resp.ok,
        status: resp.status,
        error: resp.ok ? undefined : `HTTP ${resp.status}`,
      };
    } catch (err) {
      return {
        webhookId: webhook.id,
        webhookName: webhook.name,
        success: false,
        error: String(err),
      };
    }
  }

  // ---- Public API ----

  /** Send a notification to a specific webhook. */
  async sendNotification(webhookId: string, message: string): Promise<SendResult> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      return { webhookId, webhookName: 'unknown', success: false, error: 'Webhook not found' };
    }
    if (!webhook.enabled) {
      return { webhookId, webhookName: webhook.name, success: false, error: 'Webhook is disabled' };
    }

    switch (webhook.type) {
      case 'discord':
        return this.sendToDiscord(webhook, message);
      case 'slack':
        return this.sendToSlack(webhook, message);
      case 'telegram':
        return this.sendToTelegram(webhook, message);
      default:
        return { webhookId, webhookName: webhook.name, success: false, error: `Unknown type: ${webhook.type}` };
    }
  }

  /** Broadcast a message to ALL active (enabled) webhooks. */
  async broadcast(message: string): Promise<SendResult[]> {
    const active = Array.from(this.webhooks.values()).filter(w => w.enabled);
    if (active.length === 0) {
      logger.info('webhooks', 'Broadcast: no active webhooks configured');
      return [];
    }

    logger.info('webhooks', `Broadcasting to ${active.length} webhooks`);

    const results = await Promise.allSettled(
      active.map(w => this.sendNotification(w.id, message))
    );

    return results.map(r => {
      if (r.status === 'fulfilled') return r.value;
      return { webhookId: 'unknown', webhookName: 'unknown', success: false, error: String(r.reason) };
    });
  }

  /** Add a new webhook configuration. */
  addWebhook(opts: CreateWebhookOpts): WebhookConfig {
    const config: WebhookConfig = {
      id: uuidv4(),
      name: opts.name,
      type: opts.type,
      url: opts.url,
      chatId: opts.chatId,
      enabled: opts.enabled !== false,
      createdAt: new Date().toISOString(),
    };

    if (!['discord', 'slack', 'telegram'].includes(config.type)) {
      throw new Error(`Invalid webhook type: ${config.type}. Must be: discord, slack, telegram`);
    }

    this.webhooks.set(config.id, config);
    this.save();

    logger.info('webhooks', `Added webhook: ${config.name} (${config.type})`);
    return config;
  }

  /** Remove a webhook configuration. */
  removeWebhook(id: string): boolean {
    const webhook = this.webhooks.get(id);
    if (!webhook) return false;

    this.webhooks.delete(id);
    this.save();

    logger.info('webhooks', `Removed webhook: ${webhook.name} (${id})`);
    return true;
  }

  /** List all webhook configurations. */
  listWebhooks(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  /** Send a test message to a specific webhook. */
  async testWebhook(id: string): Promise<SendResult> {
    return this.sendNotification(id, '🤖 *OpenJarvis Test Notification*\nThis is a test message from your JARVIS system. If you see this, the webhook is working correctly!');
  }
}

// ---- Singleton ----

let instance: WebhookService | null = null;

export function getWebhookService(): WebhookService {
  if (!instance) {
    instance = new WebhookService();
  }
  return instance;
}

export { WebhookService };
