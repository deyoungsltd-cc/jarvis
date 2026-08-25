'use client';

import { Suspense, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, Mail, Lock, ArrowRight, Apple, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [credentialError, setCredentialError] = useState('');

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredentialError('');
    setLoading(true);

    // Dynamic import to avoid SSR crash
    const { signIn } = await import('next-auth/react');
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setCredentialError('Invalid email or password');
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  };

  const handleGoogleLogin = async () => {
    const { signIn } = await import('next-auth/react');
    signIn('google', { callbackUrl });
  };

  const handleAppleLogin = async () => {
    const { signIn } = await import('next-auth/react');
    signIn('apple', { callbackUrl });
  };

  const getErrorMessage = (errorParam: string | null) => {
    switch (errorParam) {
      case 'OAuthAccountNotLinked':
        return 'This account is already linked to a different sign-in method.';
      case 'CredentialsSignin':
        return 'Invalid email or password.';
      case 'Callback':
        return 'Authentication error. Please try again.';
      case 'AccessDenied':
        return 'Access denied.';
      default:
        return errorParam ? 'Something went wrong. Please try again.' : '';
    }
  };

  const hasGoogle = !!process.env.NEXT_PUBLIC_GOOGLE_ENABLED;
  const hasApple = !!process.env.NEXT_PUBLIC_APPLE_ENABLED;
  const showOAuth = hasGoogle || hasApple;

  return (
    <Card className="border-border/50 shadow-lg">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Welcome back</CardTitle>
        <CardDescription>Choose your preferred sign-in method</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{getErrorMessage(error)}</span>
          </div>
        )}

        {showOAuth && (
          <>
            <div className="grid gap-2">
              {hasGoogle && (
                <Button
                  variant="outline"
                  className="w-full h-11 gap-3 text-sm font-medium"
                  onClick={handleGoogleLogin}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </Button>
              )}

              {hasApple && (
                <Button
                  variant="outline"
                  className="w-full h-11 gap-3 text-sm font-medium"
                  onClick={handleAppleLogin}
                >
                  <Apple className="h-5 w-5" />
                  Continue with Apple
                </Button>
              )}
            </div>

            <div className="relative">
              <Separator />
              <div className="absolute inset-0 flex justify-center">
                <span className="bg-card px-3 text-xs text-muted-foreground">or continue with email</span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={handleCredentialsSubmit} className="space-y-3">
          {credentialError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{credentialError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-9 h-11"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pl-9 h-11"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-11 gap-2"
            disabled={loading || !email || !password}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Sign In
          </Button>
        </form>

        <div className="pt-2 text-center">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Powered by <span className="font-semibold text-foreground">OpenJARVIS AI</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoginLoading() {
  return (
    <Card className="border-border/50 shadow-lg">
      <CardContent className="py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full bg-emerald-500/3 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-24 h-24 mb-4">
            <div className="absolute inset-0 rounded-full bg-emerald-500/10 blur-lg animate-pulse" />
            <div className="absolute inset-2 rounded-full border border-emerald-500/30" style={{ transformStyle: 'preserve-3d', animation: 'orb-spin 8s linear infinite' }}>
              <div className="absolute inset-0 rounded-full border border-emerald-400/20" style={{ transform: 'rotateY(60deg)' }} />
            </div>
            <div className="absolute inset-6 rounded-full bg-gradient-to-br from-emerald-500/20 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Bot className="h-8 w-8 text-emerald-500" style={{ filter: 'drop-shadow(0 0 12px rgba(16,185,129,0.4))' }} />
            </div>
            <style>{`@keyframes orb-spin { from { transform: rotateY(0deg) rotateX(15deg); } to { transform: rotateY(360deg) rotateX(15deg); } }`}</style>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">OpenJARVIS</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your AI agent dashboard</p>
        </div>

        <Suspense fallback={<LoginLoading />}>
          <LoginForm />
        </Suspense>

        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => window.location.href = '/register'}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Create account
          </button>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">
            Contact admin for invite
          </span>
        </div>
      </div>
    </div>
  );
}
