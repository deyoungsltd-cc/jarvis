import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const results: Map<string, Record<string, unknown>> = new Map();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { commandId, deviceId, result, error } = body;

    if (!commandId || !deviceId) {
      return NextResponse.json({ error: 'commandId and deviceId required' }, { status: 400 });
    }

    results.set(commandId, { result, error, deviceId, receivedAt: new Date() });

    // Log result to audit
    await db.auditLog.create({
      data: {
        deviceId,
        action: `daemon:result:${commandId}`,
        detail: JSON.stringify({ result, error }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to process result' }, { status: 500 });
  }
}
