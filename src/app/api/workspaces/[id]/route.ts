import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const workspace = await db.workspace.findUnique({
      where: { id },
      include: { members: true, _count: { select: { missions: true, devices: true } } },
    });
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    return NextResponse.json(workspace);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch workspace' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const workspace = await db.workspace.update({
      where: { id },
      data: { name: body.name, description: body.description },
      include: { members: true },
    });
    return NextResponse.json(workspace);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.workspace.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete workspace' }, { status: 500 });
  }
}
