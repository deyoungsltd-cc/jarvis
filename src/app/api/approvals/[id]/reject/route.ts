import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const body = await req.json();
    const approval = await db.approvalRequest.update({
      where: { id, status: 'pending' },
      data: {
        status: 'rejected',
        resolvedBy: body.resolvedBy,
        response: body.response,
      },
    });
    return NextResponse.json(approval);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to reject request' }, { status: 500 });
  }
}
