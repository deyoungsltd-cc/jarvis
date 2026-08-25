import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { requireAuth, sanitize } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20') || 20));

    const [missions, total] = await Promise.all([
      db.mission.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.mission.count(),
    ]);

    return NextResponse.json({ missions, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch missions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    if (!rateLimit(getIp(req), 20, 60_000)) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }
    const body = await req.json();
    const { goal, provider } = body;
    if (!goal || typeof goal !== 'string') {
      return NextResponse.json({ error: 'goal is required' }, { status: 400 });
    }
    const mission = await db.mission.create({
      data: { goal: sanitize(goal), status: 'draft', provider: provider || 'openrouter' },
    });
    return NextResponse.json(mission, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create mission';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
