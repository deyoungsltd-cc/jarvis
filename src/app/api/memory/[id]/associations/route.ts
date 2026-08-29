import { NextRequest } from 'next/server';
import { db } from '@/lib/api/db';
import { handleError, badRequest, notFound } from '@/lib/api/errors';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const direction = searchParams.get('direction');

    if (direction && direction !== 'from' && direction !== 'to') {
      throw badRequest('INVALID_DIRECTION', 'direction must be "from" or "to"');
    }

    const entry = await db.memoryEntry.findUnique({ where: { id } });
    if (!entry) {
      throw notFound('MEMORY_NOT_FOUND', `Memory entry not found: ${id}`);
    }

    const where: any = {};
    if (direction === 'from') {
      where.fromMemoryId = id;
    } else if (direction === 'to') {
      where.toMemoryId = id;
    } else {
      where.OR = [{ fromMemoryId: id }, { toMemoryId: id }];
    }

    const associations = await db.memoryAssociation.findMany({
      where,
    });

    return Response.json({ associations });
  } catch (err) {
    return handleError(err);
  }
}
