import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const mission = await db.mission.findUnique({
      where: { id },
      include: {
        workspace: { select: { id: true, name: true } },
        events: { orderBy: { createdAt: 'asc' } },
        approvals: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    return NextResponse.json(mission);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch mission' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.goal !== undefined) data.goal = body.goal;
    if (body.status !== undefined) data.status = body.status;
    if (body.provider !== undefined) data.provider = body.provider;
    if (body.deviceId !== undefined) data.deviceId = body.deviceId;
    if (body.tokenCount !== undefined) data.tokenCount = body.tokenCount;
    if (body.toolCallCount !== undefined) data.toolCallCount = body.toolCallCount;
    if (body.error !== undefined) data.error = body.error;
    if (body.workspaceId !== undefined) data.workspaceId = body.workspaceId;

    const mission = await db.mission.update({ where: { id }, data });
    return NextResponse.json(mission);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update mission' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.mission.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete mission' }, { status: 500 });
  }
}
