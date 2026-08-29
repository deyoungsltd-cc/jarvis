import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function GET() {
  try {
    return Response.json([]);
  } catch (err) {
    return handleError(err);
  }
}
