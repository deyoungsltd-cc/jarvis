import { NextRequest } from 'next/server';
import { db } from '@/lib/api/db';
import { handleError, notFound, badRequest } from '@/lib/api/errors';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.approvalRequest.findUnique({ where: { id } });

    if (!existing)
      return handleError(notFound('APPROVAL_NOT_FOUND', `Approval ${id} not found`));

    if (existing.status !== 'pending') {
      return handleError(
        badRequest('INVALID_STATE', `Approval is already ${existing.status}`)
      );
    }

    const updated = await db.approvalRequest.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    return Response.json(updated);
  } catch (err) {
    return handleError(err);
  }
}
