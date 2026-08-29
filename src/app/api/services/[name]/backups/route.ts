import { db } from '@/lib/api/db';
import { handleError, notFound } from '@/lib/api/errors';
import { NextRequest } from 'next/server';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const service = await db.serviceInstance.findUnique({ where: { name }, select: { id: true } });
    if (!service) {
      return notFound('NOT_FOUND', `Service ${name} not found`);
    }

    const backups = await db.serviceBackup.findMany({
      where: { serviceInstanceId: service.id },
      orderBy: { createdAt: 'desc' },
    });

    return Response.json(backups);
  } catch (err) {
    return handleError(err);
  }
}
