/**
 * Notification Service — Round 3
 *
 * Manages push notifications for mobile clients.
 * Stores notifications in the database and provides
 * client-scoped querying and read state management.
 */
import { db } from '@/lib/api/db';
import { logger } from '@/lib/api/logger';
import { v4 as uuidv4 } from 'uuid';

// ---- Types ----

export interface CreateNotificationOpts {
  clientId?: string;
  title: string;
  body: string;
  type?: 'info' | 'warning' | 'success' | 'mission_complete' | 'approval_required';
  data?: Record<string, unknown>;
}

export interface NotificationItem {
  id: string;
  clientId: string | null;
  title: string;
  body: string;
  type: string;
  data: string | null;
  read: boolean;
  createdAt: Date;
}

// ---- Public API ----

/** Create a notification (for a specific client or broadcast). */
export async function create(opts: CreateNotificationOpts): Promise<NotificationItem> {
  const notification = await db.notification.create({
    data: {
      clientId: opts.clientId || null,
      title: opts.title,
      body: opts.body,
      type: opts.type || 'info',
      data: opts.data ? JSON.stringify(opts.data) : null,
    },
  });

  logger.info('notifications', `Created: [${notification.type}] ${notification.title}`);

  return notification;
}

/** Get unread notifications for a specific client. */
export async function getForClient(clientId: string): Promise<NotificationItem[]> {
  // Get both client-specific and broadcast (null clientId) notifications
  const notifications = await db.notification.findMany({
    where: {
      OR: [
        { clientId },
        { clientId: null },
      ],
      read: false,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return notifications;
}

/** Mark a single notification as read. */
export async function markRead(id: string): Promise<boolean> {
 const updated = await db.notification.updateMany({
    where: { id, read: false },
    data: { read: true },
  });
  return updated.count > 0;
}

/** Mark all unread notifications as read for a specific client. */
export async function markAllRead(clientId: string): Promise<number> {
  const result = await db.notification.updateMany({
    where: {
      OR: [
        { clientId },
        { clientId: null },
      ],
      read: false,
    },
    data: { read: true },
  });
  return result.count;
}

/** Broadcast a notification to all clients (clientId = null). */
export async function broadcast(
  title: string,
  body: string,
  type: CreateNotificationOpts['type'] = 'info',
  data?: Record<string, unknown>,
): Promise<NotificationItem> {
  return create({ title, body, type, data });
}
