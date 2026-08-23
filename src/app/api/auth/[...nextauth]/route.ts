import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import AppleProvider from 'next-auth/providers/apple';
import Credentials from 'next-auth/providers/credentials';
import type { NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    AppleProvider({
      clientId: process.env.APPLE_ID || '',
      clientSecret: process.env.APPLE_SECRET || '',
    }),
    Credentials({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const { db } = await import('@/lib/db');
        const user = await db.user.findUnique({ where: { email: credentials.email } });
        if (!user || !user.passwordHash) return null;
        // In production, use bcrypt: const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        // For now, compare directly (replace with bcrypt before production)
        if (credentials.password === user.passwordHash) {
          return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role };
        }
        return null;
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 1 * 60 * 60, // 1 hour access token
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // First time sign-in: attach user info to token
      if (user) {
        token.id = user.id;
        token.role = (user as Record<string, unknown>).role || 'user';
      }
      // OAuth accounts: store provider info
      if (account) {
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).id = token.id;
        (session.user as Record<string, unknown>).role = token.role;
        (session.user as Record<string, unknown>).provider = token.provider;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // Auto-create user in DB on first OAuth login
      if (account?.provider === 'google' || account?.provider === 'apple') {
        const { db } = await import('@/lib/db');
        const email = user.email;
        if (!email) return false;

        const existing = await db.user.findUnique({ where: { email } });
        if (!existing) {
          await db.user.create({
            data: {
              email,
              name: user.name || profile?.name || email.split('@')[0],
              image: user.image || null,
              emailVerified: account.provider === 'apple' ? new Date() : null,
              role: 'user',
              accounts: {
                create: {
                  type: account.type,
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                  access_token: account.access_token,
                  refresh_token: account.refresh_token,
                  expires_at: account.expires_at,
                  token_type: account.token_type,
                  scope: account.scope,
                  id_token: account.id_token,
                  session_state: account.session_state,
                },
              },
            },
          });
        } else {
          // Link account if not already linked
          const existingAccount = await db.account.findFirst({
            where: { provider: account.provider, providerAccountId: account.providerAccountId },
          });
          if (!existingAccount) {
            await db.account.create({
              data: {
                userId: existing.id,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
                session_state: account.session_state,
              },
            });
          }
        }
      }
      return true;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || 'change-me-in-production',
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
