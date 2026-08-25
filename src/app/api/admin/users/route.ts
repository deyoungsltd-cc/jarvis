import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';

// GET /api/admin/users — list all users with pagination
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25') || 25));
    const search = url.searchParams.get('search') || '';

    const where = search
      ? { OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ] }
      : {};

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: { id: true, name: true, email: true, role: true, frozen: true, sessionVersion: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({ users, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Admin users list error:', err);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

// POST /api/admin/users — manually create a user
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  try {
    const { name, email, password, role } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await db.user.create({
      data: { name: name || email.split('@')[0], email, passwordHash, role: role || 'user' },
      select: { id: true, name: true, email: true, role: true, frozen: true, createdAt: true },
    });

    await db.auditLog.create({
      data: { userId: admin.userId, action: 'admin:create_user', resource: 'User', detail: JSON.stringify({ targetId: user.id, targetEmail: user.email }), ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    console.error('Admin create user error:', err);
    if ((err as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
