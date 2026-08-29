import { db } from '@/lib/api/db';
import { handleError, badRequest } from '@/lib/api/errors';
import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, platform } = body;

    if (!name || !platform) {
      return handleError(badRequest('VALIDATION_ERROR', 'name and platform are required'));
    }

    const apiKey = randomUUID();

    const client = await db.mobileClient.create({
      data: {
        name,
        platform,
        apiKey,
      },
    });

    return Response.json(
      {
        id: client.id,
        name: client.name,
        platform: client.platform,
        apiKey,
      },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}
