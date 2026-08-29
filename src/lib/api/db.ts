import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

export async function checkDbConnection() {
  const start = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { alive: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { alive: false, latencyMs: Date.now() - start, error: String(err) };
  }
}
