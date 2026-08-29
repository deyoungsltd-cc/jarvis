import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function GET() {
  try {
    const tools = await db.mcpTool.findMany({
      orderBy: { name: 'asc' },
    });
    return Response.json(tools);
  } catch (err) {
    return handleError(err);
  }
}
