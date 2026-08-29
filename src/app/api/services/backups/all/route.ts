import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function GET() {
  try {
    const backups = await db.serviceBackup.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return Response.json(backups);
  } catch (err) {
    return handleError(err);
  }
}
