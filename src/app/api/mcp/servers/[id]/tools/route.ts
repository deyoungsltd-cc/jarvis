import { db } from '@/lib/api/db';
import { handleError, notFound } from '@/lib/api/errors';
import { NextRequest } from 'next/server';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const server = await db.mcpServer.findUnique({ where: { id } });
    if (!server) {
      return notFound('NOT_FOUND', `MCP server ${id} not found`);
    }

    const tools = await db.mcpTool.findMany({
      where: { serverId: id },
      orderBy: { name: 'asc' },
    });

    return Response.json(tools);
  } catch (err) {
    return handleError(err);
  }
}
