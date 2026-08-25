import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { NextResponse } from 'next/server';

type AuthResult = { userId: string; email: string; name: string | null | undefined; role: string | undefined };
type AuthError = { ok: false; response: NextResponse };

/**
 * Require authentication for an API route.
 * Returns user info on success, or { ok: false, response } on failure.
 * Caller MUST check `ok` and return the response if false.
 */
export async function requireAuth(): Promise<AuthResult | AuthError> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return {
    ok: true as const,
    userId: (session.user as Record<string, unknown>).id as string,
    email: session.user.email!,
    name: session.user.name,
    role: (session.user as Record<string, unknown>).role as string | undefined,
  } as AuthResult;
}

/**
 * Sanitize string input — strip HTML tags to prevent XSS.
 */
export function sanitize(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}
