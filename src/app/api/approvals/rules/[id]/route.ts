import { NextRequest } from 'next/server';
import { db } from '@/lib/api/db';
import { handleError, notFound, badRequest } from '@/lib/api/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rule = await db.approvalRule.findUnique({ where: { id } });

    if (!rule)
      return handleError(notFound('RULE_NOT_FOUND', `Rule ${id} not found`));

    return Response.json(rule);
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

    const existing = await db.approvalRule.findUnique({ where: { id } });
    if (!existing)
      return handleError(notFound('RULE_NOT_FOUND', `Rule ${id} not found`));

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.action !== undefined) data.action = body.action;
    if (body.description !== undefined) data.description = body.description;
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.matchRiskLevels !== undefined) data.matchRiskLevels = body.matchRiskLevels;
    if (body.matchToolNames !== undefined) data.matchToolNames = body.matchToolNames;
    if (body.matchCapabilities !== undefined) data.matchCapabilities = body.matchCapabilities;
    if (body.priority !== undefined) data.priority = body.priority;

    const rule = await db.approvalRule.update({
      where: { id },
      data,
    });

    return Response.json(rule);
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

    const existing = await db.approvalRule.findUnique({ where: { id } });
    if (!existing)
      return handleError(notFound('RULE_NOT_FOUND', `Rule ${id} not found`));

    await db.approvalRule.delete({ where: { id } });

    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
