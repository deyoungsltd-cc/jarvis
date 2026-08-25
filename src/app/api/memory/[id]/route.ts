import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const entry = await db.memoryEntry.findUnique({ where: { id } });
    if (!entry) return NextResponse.json({ error: 'Memory entry not found' }, { status: 404 });
    return NextResponse.json(entry);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch memory entry' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.key !== undefined) data.key = body.key;
    if (body.value !== undefined) data.value = body.value ? JSON.stringify(body.value) : null;
    if (body.scope !== undefined) data.scope = body.scope;
    if (body.tags !== undefined) data.tags = body.tags ? JSON.stringify(body.tags) : null;
    if (body.importance !== undefined) data.importance = body.importance;
    if (body.source !== undefined) data.source = body.source;
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const entry = await db.memoryEntry.update({
      where: { id },
      data: { ...data, lastAccessedAt: new Date(), accessCount: { increment: 1 } },
    });
    return NextResponse.json(entry);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update memory entry' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    await db.memoryEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete memory entry' }, { status: 500 });
  }
}
