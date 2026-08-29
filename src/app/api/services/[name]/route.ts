import { db } from '@/lib/api/db';
import { handleError, notFound } from '@/lib/api/errors';
import { NextRequest } from 'next/server';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const service = await db.serviceInstance.findUnique({ where: { name } });
    if (!service) {
      return notFound('NOT_FOUND', `Service ${name} not found`);
    }
    return Response.json(service);
  } catch (err) {
    return handleError(err);
  }
}
