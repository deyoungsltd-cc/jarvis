import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '100') || 100));
    const type = searchParams.get('type');

    const where: Record<string, unknown> = { missionId: id };
    if (type) where.type = type;

    const [events, total] = await Promise.all([
      db.missionEvent.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.missionEvent.count({ where }),
    ]);

    return NextResponse.json({ data: events, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const body = await req.json();
    if (!body.type) return NextResponse.json({ error: 'type is required' }, { status: 400 });

    const event = await db.missionEvent.create({
      data: {
        missionId: id,
        type: body.type,
        payload: body.payload ? JSON.stringify(body.payload) : null,
      },
    });

    // Update mission token count if provided
    if (body.tokenCount) {
      await db.mission.update({ where: { id }, data: { tokenCount: { increment: body.tokenCount } } });
    }

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
