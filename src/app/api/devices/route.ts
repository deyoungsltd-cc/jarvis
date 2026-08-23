import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const devices = await db.device.findMany({
      include: { workspace: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(devices);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.hostname) {
      return NextResponse.json({ error: 'name and hostname are required' }, { status: 400 });
    }
    const device = await db.device.create({
      data: {
        name: body.name,
        hostname: body.hostname,
        os: body.os,
        arch: body.arch,
        status: body.status || 'offline',
        ipAddress: body.ipAddress,
        daemonVersion: body.daemonVersion,
        capabilities: body.capabilities ? JSON.stringify(body.capabilities) : null,
        workspaceId: body.workspaceId,
      },
    });
    return NextResponse.json(device, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to register device' }, { status: 500 });
  }
}
