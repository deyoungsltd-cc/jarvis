import { NextRequest } from 'next/server';
import { db } from '@/lib/api/db';
import { handleError, notFound, badRequest } from '@/lib/api/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const grant = await db.capabilityGrant.findUnique({ where: { id } });

    if (!grant)
      return handleError(notFound('GRANT_NOT_FOUND', `Grant ${id} not found`));

    return Response.json(grant);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await db.capabilityGrant.findUnique({ where: { id } });
    if (!existing)
      return handleError(notFound('GRANT_NOT_FOUND', `Grant ${id} not found`));

    const data: Record<string, unknown> = {};
    if (body.allowed !== undefined) data.allowed = body.allowed;
    if (body.scopeType !== undefined) data.scopeType = body.scopeType;
    if (body.scopeContext !== undefined) data.scopeContext = body.scopeContext;
    if (body.missionId !== undefined) data.missionId = body.missionId;
    if (body.source !== undefined) data.source = body.source;

    const grant = await db.capabilityGrant.update({
      where: { id },
      data,
    });

    return Response.json(grant);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.capabilityGrant.findUnique({ where: { id } });
    if (!existing)
      return handleError(notFound('GRANT_NOT_FOUND', `Grant ${id} not found`));

    await db.capabilityGrant.delete({ where: { id } });

    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
