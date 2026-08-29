import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function GET() {
  try {
    return Response.json(
      { error: { code: 'NOT_AVAILABLE', message: 'Desktop permissions are not available on serverless' } },
      { status: 501 },
    );
  } catch (err) {
    return handleError(err);
  }
}
