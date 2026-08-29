import { db } from '@/lib/api/db';
import { handleError, badRequest } from '@/lib/api/errors';
import { secretVault } from '@/lib/api/secret-vault';
import { NextRequest } from 'next/server';

export async function GET() {
  try {
    const { keys } = secretVault.list();
    return Response.json({ keys });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return handleError(badRequest('VALIDATION_ERROR', 'key and value are required'));
    }

    const result = secretVault.store(key, value);
    return Response.json(result, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
