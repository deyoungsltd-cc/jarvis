'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Mail, Lock, User, ArrowRight, Loader2, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

function HolographicOrb() {
  return (
    <div className="relative w-32 h-32 mx-auto mb-2">
      <div className="absolute inset-0 rounded-full bg-emerald-500/10 blur-xl animate-pulse" />
      <div
        className="absolute inset-2 rounded-full border border-emerald-500/30"
        style={{
          transformStyle: 'preserve-3d',
          animation: 'orb-spin 8s linear infinite',
        }}
      >
        <div className="absolute inset-0 rounded-full border border-emerald-400/20" style={{ transform: 'rotateY(60deg)' }} />
        <div className="absolute inset-0 rounded-full border border-emerald-300/15" style={{ transform: 'rotateY(120deg)' }} />
      </div>
      <div
        className="absolute inset-4 rounded-full border border-dashed border-emerald-500/25"
        style={{
          transformStyle: 'preserve-3d',
          animation: 'orb-spin-reverse 12s linear infinite',
        }}
      >
        <div className="absolute inset-0 rounded-full border border-emerald-400/15" style={{ transform: 'rotateX(90deg)' }} />
      </div>
      <div className="absolute inset-8 rounded-full bg-gradient-to-br from-emerald-500/20 via-emerald-400/10 to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center">
        <Bot className="h-10 w-10 text-emerald-500" style={{ filter: 'drop-shadow(0 0 12px rgba(16,185,129,0.4))' }} />
      </div>
      <style>{`
        @keyframes orb-spin {
          from { transform: rotateY(0deg) rotateX(15deg); }
          to { transform: rotateY(360deg) rotateX(15deg); }
        }
        @keyframes orb-spin-reverse {
          from { transform: rotateY(0deg) rotateX(-20deg); }
          to { transform: rotateY(-360deg) rotateX(-20deg); }
        }
      `}</style>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteKey, setInviteKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const doSignIn = useCallback(async (emailVal: string, passwordVal: string) => {
    const { signIn } = await import('next-auth/react');
    const signInRes = await signIn('credentials', {
      email: emailVal,
      password: passwordVal,
      redirect: false,
    });
    if (!signInRes?.error) {
      router.push('/');
      router.refresh();
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!inviteKey.trim()) { setError('Invite key is required'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!email.includes('@')) { setError('Invalid email address'); return; }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, confirmPassword, inviteKey }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => { doSignIn(email, password); }, 1500);
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <HolographicOrb />
          <h1 className="text-2xl font-bold tracking-tight mt-2">Create Account</h1>
          <p className="text-sm text-muted-foreground mt-1">Get started with OpenJARVIS</p>
        </div>

        {success ? (
          <Card className="border-border/50 shadow-lg">
            <CardContent className="py-12 flex flex-col items-center gap-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <h2 className="text-lg font-semibold">Account Created</h2>
              <p className="text-sm text-muted-foreground text-center">Signing you in...</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/50 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Register</CardTitle>
              <CardDescription>Create your account to start using JARVIS</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm">Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="name" type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="pl-9 h-11" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-email" className="text-sm">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="reg-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="pl-9 h-11" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-password" className="text-sm">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="reg-password" type="password" placeholder="Min. 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="pl-9 h-11" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-sm">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="confirm-password" type="password" placeholder="Repeat password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} className="pl-9 h-11" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="invite-key" className="text-sm">Invite Key</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="invite-key" type="text" placeholder="Enter your invite key" value={inviteKey} onChange={(e) => setInviteKey(e.target.value)} required className="pl-9 h-11" />
                  </div>
                </div>

                <Button type="submit" className="w-full h-11 gap-2" disabled={loading || !name || !email || !password || !confirmPassword || !inviteKey}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Create Account
                </Button>
              </form>

              <div className="relative">
                <Separator className="absolute" />
                <div className="relative flex justify-center">
                  <span className="bg-card px-3 text-xs text-muted-foreground">or</span>
                </div>
              </div>

              <Button variant="outline" className="w-full h-11 gap-2 text-sm" onClick={() => router.push('/login')}>
                Sign in with existing account
              </Button>

              <div className="pt-2 text-center">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Powered by <span className="font-semibold text-foreground">OpenJARVIS AI</span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6">
          By signing up you agree to local processing of your data.
        </p>
      </div>
    </div>
  );
}
