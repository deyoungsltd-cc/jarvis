import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import crypto from 'crypto';

function generateCode(): string {
  return crypto.randomBytes(8).toString('base64url').toUpperCase();
}

// GET /api/admin/invite-keys — list all keys
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25')));

    const [keys, total] = await Promise.all([
      db.inviteKey.findMany({
        include: { creator: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.inviteKey.count(),
    ]);

    return NextResponse.json({ keys, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('Admin invite keys list error:', err);
    return NextResponse.json({ error: 'Failed to fetch keys' }, { status: 500 });
  }
}

// POST /api/admin/invite-keys — generate new key(s)
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { count = 1, maxUses = 1, expiresAt } = await req.json();

    const numKeys = Math.min(50, Math.max(1, parseInt(String(count)) || 1));
    const uses = Math.max(1, parseInt(String(maxUses)) || 1);

    const keys = [];
    for (let i = 0; i < numKeys; i++) {
      const key = await db.inviteKey.create({
        data: {
          code: generateCode(),
          createdBy: admin.userId,
          maxUses: uses,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });
      keys.push(key);
    }

    await db.auditLog.create({
      data: { userId: admin.userId, action: 'admin:generate_keys', resource: 'InviteKey', detail: JSON.stringify({ count: numKeys, maxUses: uses, keyIds: keys.map(k => k.id) }), ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null },
    });

    return NextResponse.json({ keys }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('Admin generate keys error:', err);
    return NextResponse.json({ error: 'Failed to generate keys' }, { status: 500 });
  }
}