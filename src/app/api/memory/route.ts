import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope');
    const missionId = searchParams.get('missionId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {};
    if (scope) where.scope = scope;
    if (missionId) where.missionId = missionId;

    const [entries, total] = await Promise.all([
      db.memoryEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.memoryEntry.count({ where }),
    ]);

    return NextResponse.json({ data: entries, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch memory entries' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.key) return NextResponse.json({ error: 'key is required' }, { status: 400 });

    const entry = await db.memoryEntry.create({
      data: {
        key: body.key,
        value: body.value ? JSON.stringify(body.value) : null,
        scope: body.scope || 'working',
        tags: body.tags ? JSON.stringify(body.tags) : null,
        missionId: body.missionId,
        source: body.source || 'agent',
        importance: body.importance ?? 5,
      },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create memory entry' }, { status: 500 });
  }
}
