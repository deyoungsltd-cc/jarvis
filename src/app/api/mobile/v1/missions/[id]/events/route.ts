import { db } from '@/lib/api/db';
import { handleError, notFound } from '@/lib/api/errors';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const mission = await db.mission.findUnique({ where: { id } });
    if (!mission) {
      return notFound('NOT_FOUND', `Mission ${id} not found`);
    }

    const [events, total] = await Promise.all([
      db.missionEvent.findMany({
        where: { missionId: id },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      db.missionEvent.count({ where: { missionId: id } }),
    ]);

    return Response.json({ events, total, limit, offset });
  } catch (err) {
    return handleError(err);
  }
}
