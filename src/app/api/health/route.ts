import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Quick DB connectivity check
    await db.user.count();
    return NextResponse.json({ status: 'ok', db: 'connected' });
  } catch {
    return NextResponse.json({ status: 'degraded', db: 'disconnected' }, { status: 503 });
  }
}
