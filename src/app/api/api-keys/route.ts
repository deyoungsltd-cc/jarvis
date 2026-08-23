import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const keys = await db.apiKey.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    // Mask the keys
    const masked = keys.map((k) => ({
      ...k,
      key: k.key.slice(0, 8) + '...' + k.key.slice(-4),
    }));
    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.userId) {
      return NextResponse.json({ error: 'name and userId are required' }, { status: 400 });
    }
    const key = `oj_${crypto.randomUUID().replace(/-/g, '')}`;
    const apiKey = await db.apiKey.create({
      data: {
        name: body.name,
        key,
        userId: body.userId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    // Return the full key only on creation
    return NextResponse.json(apiKey, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}
