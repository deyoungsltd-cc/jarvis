import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function POST() {
  try {
    return Response.json({ updated: 0 });
  } catch (err) {
    return handleError(err);
  }
}
