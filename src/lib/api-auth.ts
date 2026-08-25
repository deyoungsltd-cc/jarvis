import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { NextResponse } from 'next/server';

/**
 * Require authentication for an API route.
 * Returns session user info or throws a 401 response.
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  return {
    userId: (session.user as Record<string, unknown>).id as string,
    email: session.user.email!,
    name: session.user.name,
    role: (session.user as Record<string, unknown>).role as string | undefined,
  };
}

/**
 * Sanitize string input — strip HTML tags to prevent XSS.
 */
export function sanitize(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}
