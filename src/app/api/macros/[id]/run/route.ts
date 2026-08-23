import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const macro = await db.macro.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        runCount: { increment: 1 },
      },
    });
    return NextResponse.json({ success: true, macro });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to run macro' }, { status: 500 });
  }
}
