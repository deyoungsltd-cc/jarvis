/**
 * Prisma database client singleton.
 *
 * Reads database configuration from src/utils/database.ts to ensure
 * DATABASE_URL is set correctly before Prisma connects.
 */
import { PrismaClient } from '../../node_modules/.prisma/client/index.js';
import { getDatabaseConfig, DatabaseConfig } from './database.js';

// Initialize database config (logs which provider is active)
const dbConfig: DatabaseConfig = getDatabaseConfig();

// Ensure DATABASE_URL is in the environment for Prisma
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim().length === 0) {
  process.env.DATABASE_URL = dbConfig.url;
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

/** Check that the database connection is alive */
export async function checkDbConnection(): Promise<{ alive: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { alive: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { alive: false, latencyMs: Date.now() - start, error: String(err) };
  }
}

/**
 * Get information about the current database configuration and connection.
 * Returns the provider type, display name, and live connection status.
 */
export async function getDatabaseInfo(): Promise<{
  provider: string;
  providerName: string;
  url: string;
  connectionStatus: 'connected' | 'disconnected';
  latencyMs?: number;
  error?: string;
}> {
  const connResult = await checkDbConnection();
  return {
    provider: dbConfig.provider,
    providerName: dbConfig.providerName,
    url: dbConfig.url.replace(/:([^:@]+)@/, ':****@'), // Mask password
    connectionStatus: connResult.alive ? 'connected' : 'disconnected',
    latencyMs: connResult.alive ? connResult.latencyMs : undefined,
    error: connResult.error,
  };
}
