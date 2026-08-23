import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Device command queue (in-memory for now, would use Redis in production)
const commandQueue: Map<string, Array<{ id: string; command: string; params: Record<string, unknown>; createdAt: Date }>> = new Map();
const results: Map<string, Record<string, unknown>> = new Map();

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { deviceId, command, params } = body;
  if (!deviceId || !command) return NextResponse.json({ error: 'deviceId and command required' }, { status: 400 });

  const cmdId = crypto.randomUUID();
  const queue = commandQueue.get(deviceId) || [];
  queue.push({ id: cmdId, command, params: params || {}, createdAt: new Date() });
  commandQueue.set(deviceId, queue);

  // Log to audit
  await db.auditLog.create({ data: { deviceId, action: `daemon:command:${command}`, detail: JSON.stringify(params) } });

  return NextResponse.json({ commandId: cmdId, status: 'queued' });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get('deviceId');
  if (!deviceId) {
    // Return all devices status
    const devices = await db.device.findMany({ select: { id: true, name: true, hostname: true, status: true, lastSeenAt: true, os: true } });
    return NextResponse.json(devices);
  }
  // Return pending commands for device
  const cmds = commandQueue.get(deviceId) || [];
  return NextResponse.json({ commands: cmds });
}