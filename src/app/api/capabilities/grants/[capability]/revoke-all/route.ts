import { NextRequest } from 'next/server';
import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ capability: string }> }
) {
  try {
    const { capability } = await params;

    const result = await db.capabilityGrant.deleteMany({
      where: { capability },
    });

    return Response.json({ revoked: result.count });
  } catch (err) {
    return handleError(err);
  }
}
