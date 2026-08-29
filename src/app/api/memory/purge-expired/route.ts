import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function POST() {
  try {
    const result = await db.memoryEntry.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    return Response.json({ purged: result.count });
  } catch (err) {
    return handleError(err);
  }
}