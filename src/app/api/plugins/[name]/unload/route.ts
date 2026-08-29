import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function POST() {
  try {
    return Response.json({ unloaded: true });
  } catch (err) {
    return handleError(err);
  }
}
