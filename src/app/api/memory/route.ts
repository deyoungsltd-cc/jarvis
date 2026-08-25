import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, sanitize } from '@/lib/api-auth';

/** Parse JSON string fields that Prisma returns as raw strings */
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
    const scope = searchParams.get('scope');
    const missionId = searchParams.get('missionId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));

    const where: Record<string, unknown> = {};
    if (scope) where.scope = scope;
    if (missionId) where.missionId = missionId;

    const [entries, total] = await Promise.all([
      db.memoryEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.memoryEntry.count({ where }),
    ]);

    // Return flat array — client expects MemoryEntry[] directly
    const parsed = entries.map(e => parseEntry(e as unknown as Record<string, unknown>));
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Memory list error:', error);
    return NextResponse.json({ error: 'Failed to fetch memory entries' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    if (!body.key) return NextResponse.json({ error: 'key is required' }, { status: 400 });

    const entry = await db.memoryEntry.create({
      data: {
        key: body.key,
        value: body.value ? JSON.stringify(body.value) : null,
        scope: body.scope || 'working',
        tags: body.tags ? JSON.stringify(body.tags) : null,
        missionId: body.missionId,
        source: body.source || 'agent',
        importance: body.importance ?? 5,
      },
    });

    // Parse JSON fields before returning
    return NextResponse.json(parseEntry(entry as unknown as Record<string, unknown>), { status: 201 });
  } catch (error) {
    console.error('Memory create error:', error);
    return NextResponse.json({ error: 'Failed to create memory entry' }, { status: 500 });
  }
}
