import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function POST() {
  try {
    return Response.json(
      { error: { code: 'NOT_AVAILABLE', message: 'This endpoint is not available in serverless mode' } },
      { status: 501 },
    );
  } catch (err) {
    return handleError(err);
  }
}
