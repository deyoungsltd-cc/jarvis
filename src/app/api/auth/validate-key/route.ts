import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { inviteKey } = await req.json();
    if (!inviteKey || typeof inviteKey !== 'string' || !inviteKey.trim()) {
      return NextResponse.json({ error: 'Invite key is required' }, { status: 400 });
    }

    // Check DB invite key
    const dbKey = await db.inviteKey.findUnique({ where: { code: inviteKey.trim() } });

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

    // Fallback: check env var
    const envKey = process.env.INVITE_KEY;
    if (envKey && inviteKey.trim() === envKey) {
      return NextResponse.json({ valid: true });
    }

    return NextResponse.json({ error: 'Invalid invite key' }, { status: 403 });
  } catch (error) {
    console.error('Key validation error:', error);
    return NextResponse.json({ error: 'Key validation failed' }, { status: 500 });
  }
}
