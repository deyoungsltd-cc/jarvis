import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const [entries, total] = await Promise.all([
      db.memoryEntry.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.memoryEntry.count(),
    ]);

    return Response.json({ entries, total, limit, offset });
  } catch (err) {
    return handleError(err);
  }
}
