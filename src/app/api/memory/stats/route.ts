import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function GET() {
  try {
    const byScope = await db.memoryEntry.groupBy({
      by: ['scope'],
      _count: true,
    });

    const total = byScope.reduce((sum, item) => sum + item._count, 0);

    return Response.json({
      total,
      byScope: byScope.map((item) => ({
        scope: item.scope,
        count: item._count,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
