import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const { db } = await import('@/lib/db');
        const user = await db.user.findUnique({ where: { email: credentials.email } });
        if (!user || !user.passwordHash) return null;
        // Simple password check (bcrypt in production)
        if (credentials.password === 'admin') return user; // placeholder
        return null;
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/' },
  secret: process.env.JWT_SECRET || 'fallback-secret',
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
