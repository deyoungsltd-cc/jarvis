import { db } from '@/lib/api/db';
import { handleError, notFound } from '@/lib/api/errors';
import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = await db.mobileClient.findUnique({ where: { id } });
    if (!client) {
      return notFound('NOT_FOUND', `Client ${id} not found`);
    }

    const newApiKey = randomUUID();

    await db.mobileClient.update({
      where: { id },
      data: { apiKey: newApiKey },
    });

    return Response.json({ id, apiKey: newApiKey });
  } catch (err) {
    return handleError(err);
  }
}
