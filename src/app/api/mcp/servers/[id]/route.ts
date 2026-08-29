import { db } from '@/lib/api/db';
import { handleError, notFound, badRequest } from '@/lib/api/errors';
import { NextRequest } from 'next/server';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const server = await db.mcpServer.findUnique({
      where: { id },
      include: { tools: true },
    });
    if (!server) {
      return notFound('NOT_FOUND', `MCP server ${id} not found`);
    }
    return Response.json(server);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const server = await db.mcpServer.findUnique({ where: { id } });
    if (!server) {
      return notFound('NOT_FOUND', `MCP server ${id} not found`);
    }

    const updated = await db.mcpServer.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.transport !== undefined && { transport: body.transport }),
        ...(body.command !== undefined && { command: body.command }),
        ...(body.args !== undefined && { args: body.args }),
        ...(body.url !== undefined && { url: body.url }),
        ...(body.env !== undefined && { env: body.env }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
      },
    });

    return Response.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const server = await db.mcpServer.findUnique({ where: { id } });
    if (!server) {
      return notFound('NOT_FOUND', `MCP server ${id} not found`);
    }

    await db.mcpServer.delete({ where: { id } });
    return Response.json({ deleted: true, id });
  } catch (err) {
    return handleError(err);
  }
}
