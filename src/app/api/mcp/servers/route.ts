import { db } from '@/lib/api/db';
import { handleError, badRequest } from '@/lib/api/errors';
import { NextRequest } from 'next/server';

export async function GET() {
  try {
    const servers = await db.mcpServer.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return Response.json(servers);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, transport, command, args, url, env } = body;

    if (!name || !transport) {
      return handleError(badRequest('VALIDATION_ERROR', 'name and transport are required'));
    }

    const server = await db.mcpServer.create({
      data: {
        name,
        description,
        transport,
        command: command ?? null,
        args: args ?? null,
        url: url ?? null,
        env: env ?? null,
      },
    });

    return Response.json(server, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
