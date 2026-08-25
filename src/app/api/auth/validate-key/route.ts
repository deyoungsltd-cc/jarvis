import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { inviteKey } = await req.json();
    if (!inviteKey || typeof inviteKey !== 'string' || !inviteKey.trim()) {
      return NextResponse.json({ error: 'Invite key is required' }, { status: 400 });
    }

    const code = inviteKey.trim();

    // Case-insensitive lookup — PostgreSQL is case-sensitive by default
    const dbKey = await db.inviteKey.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
    });

    if (dbKey) {
      if (!dbKey.active) {
        return NextResponse.json({ error: 'This invite key has been deactivated' }, { status: 403 });
      }
      if (dbKey.expiresAt && dbKey.expiresAt < new Date()) {
        return NextResponse.json({ error: 'This invite key has expired' }, { status: 403 });
      }
      if (dbKey.useCount >= dbKey.maxUses) {
        return NextResponse.json({ error: 'This invite key has reached its usage limit' }, { status: 403 });
      }
      return NextResponse.json({ valid: true });
    }

    // Fallback: check env var (case-sensitive for env)
    const envKey = process.env.INVITE_KEY;
    if (envKey && code === envKey) {
      return NextResponse.json({ valid: true });
    }

    return NextResponse.json({ error: 'Invalid invite key' }, { status: 403 });
  } catch (error) {
    console.error('Key validation error:', error);
    return NextResponse.json({ error: 'Key validation failed. Is DATABASE_URL configured?' }, { status: 500 });
  }
}
