import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function GET() {
  try {
    const stats = await db.approvalRequest.groupBy({
      by: ['status'],
      _count: { id: true },
      orderBy: { status: 'asc' },
    });

    const result = stats.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count.id;
      return acc;
    }, {});

    return Response.json(result);
  } catch (err) {
    return handleError(err);
  }
}
