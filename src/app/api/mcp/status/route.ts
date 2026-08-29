import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function GET() {
  try {
    const total = await db.mcpServer.count();
    const connected = await db.mcpServer.count({ where: { status: 'connected' } });
    return Response.json({ connected, total });
  } catch (err) {
    return handleError(err);
  }
}
