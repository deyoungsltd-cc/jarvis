import { NextRequest } from 'next/server';
import { db } from '@/lib/api/db';
import { handleError, badRequest } from '@/lib/api/errors';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw badRequest('INVALID_IDS', 'ids must be a non-empty array of strings');
    }

    const stringIds = ids.filter((id: unknown) => typeof id === 'string');
    if (stringIds.length === 0) {
      throw badRequest('INVALID_IDS', 'ids must contain at least one valid string id');
    }

    const result = await db.memoryEntry.deleteMany({
      where: { id: { in: stringIds } },
    });

    return Response.json({ deleted: result.count });
  } catch (err) {
    return handleError(err);
  }
}