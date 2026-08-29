import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function POST() {
  try {
    return Response.json({ reloaded: true });
  } catch (err) {
    return handleError(err);
  }
}
