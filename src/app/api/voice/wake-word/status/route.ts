import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function GET() {
  try {
    return Response.json({ active: false });
  } catch (err) {
    return handleError(err);
  }
}
