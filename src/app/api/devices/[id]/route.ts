import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const device = await db.device.findUnique({
      where: { id },
      include: { workspace: { select: { id: true, name: true } }, auditLogs: { take: 10, orderBy: { createdAt: 'desc' } } },
    });
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    return NextResponse.json(device);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch device' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.hostname !== undefined) data.hostname = body.hostname;
    if (body.os !== undefined) data.os = body.os;
    if (body.arch !== undefined) data.arch = body.arch;
    if (body.status !== undefined) data.status = body.status;
    if (body.ipAddress !== undefined) data.ipAddress = body.ipAddress;
    if (body.daemonVersion !== undefined) data.daemonVersion = body.daemonVersion;
    if (body.capabilities !== undefined) data.capabilities = body.capabilities ? JSON.stringify(body.capabilities) : null;
    if (body.workspaceId !== undefined) data.workspaceId = body.workspaceId;
    if (body.status !== undefined || body.daemonVersion !== undefined) {
      data.lastSeenAt = new Date();
    }

    const device = await db.device.update({ where: { id }, data });
    return NextResponse.json(device);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update device' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.device.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
  }
}
