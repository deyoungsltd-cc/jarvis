import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { NextResponse } from 'next/server';

type AdminResult = { userId: string; email: string; role: string };
type AuthError = { ok: false; response: NextResponse };

/**
 * Verify the current user is an admin. Call from admin API routes.
 * Returns { userId, email, role } on success.
 * Returns { ok: false, response } on failure — the caller MUST return that response.
 */
export async function requireAdmin(): Promise<AdminResult | AuthError> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const role = (session.user as Record<string, unknown>).role as string | undefined;
  if (role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 }) };
  }
  return {
    ok: true as const,
    userId: (session.user as Record<string, unknown>).id as string,
    email: session.user.email!,
    role: role!,
  } as AdminResult;
}

/** Helper to unwrap requireAdmin result — use in routes that need the session data */
export function unwrapAuth(result: AdminResult | AuthError): AdminResult {
  if (!result.ok) throw result.response;
  return result;
}
