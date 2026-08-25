import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

/**
 * POST /api/admin/seed
 * Creates the initial admin account if none exists.
 * Requires a seed secret to prevent unauthorized seeding.
 * 
 * Body: { email?: string, password?: string, seedSecret: string }
 * The seedSecret must match ADMIN_SEED_SECRET env var (or 'openjarvis-seed-2024' as default)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const seedSecret = process.env.ADMIN_SEED_SECRET || 'openjarvis-seed-2024';
    if (body.seedSecret !== seedSecret) {
      return NextResponse.json({ error: 'Invalid seed secret' }, { status: 403 });
    }

    const existingAdmin = await db.user.findFirst({ where: { role: 'admin' } });
    if (existingAdmin) {
      return NextResponse.json({ error: 'Admin already exists. Use admin panel to manage.', existingAdmin: { email: existingAdmin.email, id: existingAdmin.id } }, { status: 400 });
    }

    const email = body.email || 'admin@openjarvis.ai';
    const password = body.password || generatePassword();
    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await db.user.create({
      data: { name: 'Admin', email, passwordHash, role: 'admin' },
    });

    const masterKey = process.env.INVITE_KEY;
    if (masterKey) {
      try {
        await db.inviteKey.create({
          data: { code: masterKey, createdBy: admin.id, maxUses: 1000, active: true },
        });
      } catch {}
    }

    return NextResponse.json({
      id: admin.id,
      email: admin.email,
      password,
      message: 'Admin account created. Save this password — it will not be shown again.',
    }, { status: 201 });
  } catch (err) {
    console.error('Seed admin error:', err);
    if ((err as any)?.code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to seed admin' }, { status: 500 });
  }
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let pw = '';
  for (let i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}
