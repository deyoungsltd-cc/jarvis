import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function GET() {
  try {
    const clients = await db.mobileClient.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const truncated = clients.map((c) => ({
      ...c,
      apiKey: c.apiKey.slice(0, 8) + '...',
    }));

    return Response.json(truncated);
  } catch (err) {
    return handleError(err);
  }
}
