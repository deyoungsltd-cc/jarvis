/**
 * Mobile Client Service — Phase 7
 *
 * Manages API key-based client registration and authentication.
 */
import { db } from '@/lib/api/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/api/logger';

const VALID_PLATFORMS = ['ios', 'android', 'web'];

function generateApiKey(): string {
  // 32-byte hex string (64 chars)
  return uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '').slice(0, 32);
}

export const mobileClientService = {
  /** Register a new mobile client, returns the API key */
  async register(input: { name: string; platform: string }) {
    if (!input.name || typeof input.name !== 'string') {
      throw new Error('Client name is required');
    }
    if (!VALID_PLATFORMS.includes(input.platform)) {
      throw new Error(`Invalid platform: ${input.platform}. Must be one of: ${VALID_PLATFORMS.join(', ')}`);
    }

    const apiKey = generateApiKey();
    const client = await db.mobileClient.create({
      data: {
        name: input.name,
        platform: input.platform,
        apiKey,
      },
    });

    logger.info('-', `Mobile client registered: ${client.name} (${client.platform})`);
    return { ...client, apiKey };
  },

  /** Authenticate a request by API key. Returns the client or null. */
  async authenticate(apiKey: string | undefined) {
    if (!apiKey) return null;
    const client = await db.mobileClient.findUnique({
      where: { apiKey },
    });
    if (!client || !client.enabled) return null;

    // Update last seen
    await db.mobileClient.update({
      where: { id: client.id },
      data: { lastSeenAt: new Date() },
    }).catch(() => {});

    return client;
  },

  /** List all registered clients */
  async list() {
    return db.mobileClient.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Revoke a client's API key (disable) */
  async revoke(id: string) {
    const client = await db.mobileClient.update({
      where: { id },
      data: { enabled: false },
    });
    return client;
  },

  /** Re-enable a client */
  async enable(id: string) {
    return db.mobileClient.update({
      where: { id },
      data: { enabled: true },
    });
  },

  /** Delete a client */
  async remove(id: string) {
    return db.mobileClient.delete({ where: { id } });
  },

  /** Regenerate API key for a client */
  async regenerateApiKey(id: string) {
    const newKey = generateApiKey();
    const client = await db.mobileClient.update({
      where: { id },
      data: { apiKey: newKey },
    });
    return { ...client, apiKey: newKey };
  },
};
