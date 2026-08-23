import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const workspaces = await db.workspace.findMany({
      include: { members: true, _count: { select: { missions: true, devices: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(workspaces);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const workspace = await db.workspace.create({
      data: {
        name: body.name,
        description: body.description,
        ownerId: body.ownerId || 'system',
        members: body.ownerId ? { create: { userId: body.ownerId, role: 'owner' } } : undefined,
      },
      include: { members: true },
    });
    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 });
  }
}
