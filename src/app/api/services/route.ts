import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const group = searchParams.get('group');
    const status = searchParams.get('status');
    const enabled = searchParams.get('enabled');

    const where: Record<string, unknown> = {};
    if (group) where.group = group;
    if (status) where.status = status;
    if (enabled !== null) where.enabled = enabled === 'true';

    const services = await db.serviceInstance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return Response.json(services);
  } catch (err) {
    return handleError(err);
  }
}
