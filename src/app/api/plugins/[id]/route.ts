import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.version !== undefined) data.version = body.version;
    if (body.description !== undefined) data.description = body.description;
    if (body.config !== undefined) data.config = body.config ? JSON.stringify(body.config) : null;

    const plugin = await db.plugin.update({ where: { id }, data });
    return NextResponse.json(plugin);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update plugin' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.plugin.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete plugin' }, { status: 500 });
  }
}
