import { db } from '@/lib/api/db';
import { handleError, notFound } from '@/lib/api/errors';
import { secretVault } from '@/lib/api/secret-vault';
import { NextRequest } from 'next/server';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key: secretKey } = await params;
    const result = secretVault.retrieve(secretKey);
    return Response.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Secret not found')) {
      return notFound('NOT_FOUND', err.message);
    }
    return handleError(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key: secretKey } = await params;
    const result = secretVault.delete(secretKey);
    return Response.json(result);
  } catch (err) {
    return handleError(err);
  }
}
