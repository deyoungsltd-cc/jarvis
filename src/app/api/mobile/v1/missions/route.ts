import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function GET() {
  try {
    const missions = await db.mission.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        goal: true,
        status: true,
        riskLevel: true,
        budget: true,
        maxToolCalls: true,
        toolCallCount: true,
        tokenUsage: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return Response.json(missions);
  } catch (err) {
    return handleError(err);
  }
}
