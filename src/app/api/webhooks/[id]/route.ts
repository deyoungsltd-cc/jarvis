import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.url !== undefined) data.url = body.url;
    if (body.events !== undefined) data.events = typeof body.events === 'string' ? body.events : JSON.stringify(body.events);
    if (body.secret !== undefined) data.secret = body.secret;
    if (body.enabled !== undefined) data.enabled = body.enabled;

    const webhook = await db.webhook.update({ where: { id }, data });
    return NextResponse.json(webhook);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.webhook.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
  }
}
