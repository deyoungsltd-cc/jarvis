import { NextRequest } from 'next/server';
import { db } from '@/lib/api/db';
import { handleError, notFound } from '@/lib/api/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const approval = await db.approvalRequest.findUnique({ where: { id } });

    if (!approval)
      return handleError(notFound('APPROVAL_NOT_FOUND', `Approval ${id} not found`));

    return Response.json(approval);
  } catch (err) {
    return handleError(err);
  }
}
