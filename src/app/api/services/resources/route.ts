import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function GET() {
  try {
    const services = await db.serviceInstance.count();
    const available = await db.serviceInstance.count({ where: { status: 'running' } });
    return Response.json({ services, available });
  } catch (err) {
    return handleError(err);
  }
}
