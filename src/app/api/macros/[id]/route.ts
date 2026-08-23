import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const macro = await db.macro.findUnique({
      where: { id },
      include: { workspace: { select: { id: true, name: true } }, user: { select: { id: true, name: true, email: true } } },
    });
    if (!macro) return NextResponse.json({ error: 'Macro not found' }, { status: 404 });
    return NextResponse.json(macro);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch macro' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.trigger !== undefined) data.trigger = body.trigger;
    if (body.steps !== undefined) data.steps = typeof body.steps === 'string' ? body.steps : JSON.stringify(body.steps);
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.workspaceId !== undefined) data.workspaceId = body.workspaceId;

    const macro = await db.macro.update({ where: { id }, data });
    return NextResponse.json(macro);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update macro' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.macro.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete macro' }, { status: 500 });
  }
}
