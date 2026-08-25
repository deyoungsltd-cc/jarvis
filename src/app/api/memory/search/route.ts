import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    if (!q) return NextResponse.json({ error: 'q query parameter is required' }, { status: 400 });

    const entries = await db.memoryEntry.findMany({
      where: {
        OR: [
          { key: { contains: q } },
          { value: { contains: q } },
        ],
      },
      orderBy: { importance: 'desc' },
      take: 50,
    });

    return NextResponse.json({ data: entries, query: q, count: entries.length });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to search memory' }, { status: 500 });
  }
}
