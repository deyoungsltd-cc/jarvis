import { db } from '@/lib/api/db';
import { handleError, notFound } from '@/lib/api/errors';
import { NextRequest } from 'next/server';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const mission = await db.mission.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!mission) {
      return notFound('NOT_FOUND', `Mission ${id} not found`);
    }
    return Response.json(mission);
  } catch (err) {
    return handleError(err);
  }
}
