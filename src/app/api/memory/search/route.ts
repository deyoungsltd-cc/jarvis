import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

function parseEntry(entry: Record<string, unknown>) {
  const parsed = { ...entry };
  try { parsed.value = JSON.parse(parsed.value as string); } catch { /* keep as-is */ }
  try { parsed.tags = JSON.parse(parsed.tags as string); } catch { parsed.tags = []; }
  return parsed;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    if (!q) return NextResponse.json({ error: 'q query parameter is required' }, { status: 400 });

    const scope = searchParams.get('scope');
    const where: Record<string, unknown> = {
      OR: [
        { key: { contains: q } },
        { value: { contains: q } },
      ],
    };
    if (scope) (where as Record<string, unknown[]>).AND = [{ scope }];

    const entries = await db.memoryEntry.findMany({
      where,
      orderBy: { importance: 'desc' },
      take: 50,
    });

    // Return flat array — client calls .map() on the result
    const parsed = entries.map(e => parseEntry(e as unknown as Record<string, unknown>));
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Memory search error:', error);
    return NextResponse.json({ error: 'Failed to search memory' }, { status: 500 });
  }
}
