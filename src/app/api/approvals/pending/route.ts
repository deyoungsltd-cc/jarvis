import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function GET() {
  try {
    const pending = await db.approvalRequest.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    return Response.json(pending);
  } catch (err) {
    return handleError(err);
  }
}
