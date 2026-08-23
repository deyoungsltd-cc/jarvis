import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');
    const workspaceId = searchParams.get('workspaceId');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (workspaceId) where.workspaceId = workspaceId;

    const [missions, total] = await Promise.all([
      db.mission.findMany({
        where,
        include: {
          workspace: { select: { id: true, name: true } },
          _count: { select: { events: true, approvals: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.mission.count({ where }),
    ]);

    return NextResponse.json({ data: missions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch missions' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.goal) return NextResponse.json({ error: 'goal is required' }, { status: 400 });

    const mission = await db.mission.create({
      data: {
        goal: body.goal,
        status: body.status || 'draft',
        provider: body.provider,
        workspaceId: body.workspaceId,
        deviceId: body.deviceId,
      },
    });
    return NextResponse.json(mission, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create mission' }, { status: 500 });
  }
}
