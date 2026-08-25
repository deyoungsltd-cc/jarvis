import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { NextAuthOptions } from 'next-auth';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({ where: { email: credentials.email } });
        if (!user || !user.passwordHash) return null;
        // Block frozen accounts
        if ('frozen' in user && (user as Record<string, unknown>).frozen === true) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 1 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as Record<string, unknown>).role || 'user';
        // Store sessionVersion to detect forced logouts
        const dbUser = await db.user.findUnique({ where: { id: user.id as string }, select: { sessionVersion: true } });
        if (dbUser && 'sessionVersion' in dbUser) token.sessionVersion = (dbUser as Record<string, unknown>).sessionVersion;
      }
      // Check if session was invalidated
      if (trigger === 'update' || token.id) {
        const dbUser = await db.user.findUnique({ where: { id: token.id as string }, select: { sessionVersion: true, frozen: true } });
        if (dbUser) {
          if ('frozen' in dbUser && (dbUser as Record<string, unknown>).frozen === true) return null as any;
          if ('sessionVersion' in dbUser && token.sessionVersion !== (dbUser as Record<string, unknown>).sessionVersion) return null as any;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).id = token.id;
        (session.user as Record<string, unknown>).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET || 'change-me-in-production',
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
