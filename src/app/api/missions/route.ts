import { db } from '@/lib/db';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
    const offset = Number(url.searchParams.get('offset')) || 0;

    const missions = await db.mission.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { events: { orderBy: { createdAt: 'asc' }, take: 50 } },
    });
    return Response.json(missions);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch missions';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!rateLimit(getIp(req), 20, 60_000)) {
      return Response.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }
    const body = await req.json();
    const { goal, provider } = body;
    if (!goal || typeof goal !== 'string') {
      return Response.json({ error: 'goal is required' }, { status: 400 });
    }
    const mission = await db.mission.create({
      data: { goal, status: 'draft', provider: provider || 'openrouter' },
    });
    return Response.json(mission, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create mission';
    return Response.json({ error: message }, { status: 500 });
  }
}
