import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.cronExpr !== undefined) data.cronExpr = body.cronExpr;
    if (body.goal !== undefined) data.goal = body.goal;
    if (body.provider !== undefined) data.provider = body.provider;
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.lastRunAt !== undefined) data.lastRunAt = body.lastRunAt ? new Date(body.lastRunAt) : null;
    if (body.nextRunAt !== undefined) data.nextRunAt = body.nextRunAt ? new Date(body.nextRunAt) : null;
    if (body.runCount !== undefined) data.runCount = body.runCount;

    const job = await db.scheduledJob.update({ where: { id }, data });
    return NextResponse.json(job);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update scheduled job' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.scheduledJob.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete scheduled job' }, { status: 500 });
  }
}
