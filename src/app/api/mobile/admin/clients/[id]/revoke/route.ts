import { db } from '@/lib/api/db';
import { handleError, notFound } from '@/lib/api/errors';
import { NextRequest } from 'next/server';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = await db.mobileClient.findUnique({ where: { id } });
    if (!client) {
      return notFound('NOT_FOUND', `Client ${id} not found`);
    }

    await db.mobileClient.update({
      where: { id },
      data: { enabled: false },
    });

    return Response.json({ revoked: true, id });
  } catch (err) {
    return handleError(err);
  }
}
