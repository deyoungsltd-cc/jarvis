import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  email: z.string().email('Invalid email address').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password too long'),
  confirmPassword: z.string(),
  inviteKey: z.string().min(1, 'Invite key is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Simple in-memory rate limit: 5 registrations per IP per minute
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many registration attempts. Try again in a minute.' }, { status: 429 });
    }

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Validation failed' }, { status: 400 });
    }

    const { name, email, password, inviteKey } = parsed.data;

    // Case-insensitive key lookup — PostgreSQL is case-sensitive by default
    const dbKey = await db.inviteKey.findFirst({
      where: { code: { equals: inviteKey.trim(), mode: 'insensitive' } },
    });
    const envKey = process.env.INVITE_KEY;

    let keyValid = false;
    if (dbKey) {
      // DB-based key check
      if (!dbKey.active) {
        return NextResponse.json({ error: 'This invite key has been deactivated' }, { status: 403 });
      }
      if (dbKey.expiresAt && dbKey.expiresAt < new Date()) {
        return NextResponse.json({ error: 'This invite key has expired' }, { status: 403 });
      }
      if (dbKey.useCount >= dbKey.maxUses) {
        return NextResponse.json({ error: 'This invite key has reached its usage limit' }, { status: 403 });
      }
      keyValid = true;
    } else if (envKey && inviteKey === envKey) {
      keyValid = true;
    }

    if (!keyValid) {
      return NextResponse.json({ error: 'Invalid invite key' }, { status: 403 });
    }

    // Check if user already exists
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await db.user.create({
      data: {
        name: name || email.split('@')[0],
        email,
        passwordHash,
        role: 'user',
      },
    });

    // Update invite key usage if it's a DB key
    if (dbKey) {
      await db.inviteKey.update({
        where: { id: dbKey.id },
        data: { useCount: { increment: 1 } },
        // Note: usedBy only tracks last user for multi-use keys
      });
    }

    return NextResponse.json(
      { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt },
      { status: 201 },
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed. Is DATABASE_URL configured?' }, { status: 500 });
  }
}
