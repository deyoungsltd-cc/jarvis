import { NextRequest } from 'next/server';
import { db } from '@/lib/api/db';
import { handleError, notFound } from '@/lib/api/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const tool = await db.tool.findUnique({
      where: { name },
    });

    if (!tool)
      return handleError(notFound('TOOL_NOT_FOUND', `Tool ${name} not found`));

    return Response.json({
      ...tool,
      inputSchema: tool.inputSchema ? JSON.parse(tool.inputSchema) : null,
      outputSchema: tool.outputSchema ? JSON.parse(tool.outputSchema) : null,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const body = await req.json();

    const tool = await db.tool.update({
      where: { name },
      data: {
        ...(body.description !== undefined && { description: body.description }),
        ...(body.inputSchema !== undefined && {
          inputSchema: JSON.stringify(body.inputSchema),
        }),
        ...(body.outputSchema !== undefined && {
          outputSchema: JSON.stringify(body.outputSchema),
        }),
        ...(body.riskLevel !== undefined && { riskLevel: body.riskLevel }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
      },
    });

    return Response.json({
      ...tool,
      inputSchema: tool.inputSchema ? JSON.parse(tool.inputSchema) : null,
      outputSchema: tool.outputSchema ? JSON.parse(tool.outputSchema) : null,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;

    const existing = await db.tool.findUnique({
      where: { name },
    });

    if (!existing)
      return handleError(notFound('TOOL_NOT_FOUND', `Tool ${name} not found`));

    await db.tool.delete({
      where: { name },
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
