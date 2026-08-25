import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { NextResponse } from 'next/server';

/**
 * Verify the current user is an admin. Call from admin API routes.
 * Returns { userId, email, role } or throws a 403 response.
 */
export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const role = (session.user as Record<string, unknown>).role as string | undefined;
  if (role !== 'admin') {
    throw new NextResponse(JSON.stringify({ error: 'Forbidden: admin only' }), { status: 403 });
  }
  return {
    userId: (session.user as Record<string, unknown>).id as string,
    email: session.user.email!,
    role: role!,
  };
}
