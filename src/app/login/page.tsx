'use client';

import { Suspense, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const urlError = searchParams.get('error');

  // Step system: 'key' -> 'register' | 'login'
  const [step, setStep] = useState<'key' | 'register' | 'login'>('key');
  const [inviteKey, setInviteKey] = useState('');
  const [keyError, setKeyError] = useState('');
  const [keyLoading, setKeyLoading] = useState(false);
  // Register fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [success, setSuccess] = useState(false);
  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const getErrorMessage = (errorParam: string | null) => {
    switch (errorParam) {
      case 'CredentialsSignin': return 'Invalid email or password.';
      case 'Callback': return 'Authentication error. Please try again.';
      case 'AccessDenied': return 'Access denied. Your account may be frozen.';
      default: return errorParam ? 'Something went wrong. Please try again.' : '';
    }
  };

  // Step 1: Validate invite key
  const handleKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeyError('');
    if (!inviteKey.trim()) { setKeyError('Invite key is required'); return; }

    setKeyLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteKey, email: '_validate_only@check.com', password: 'aaaaaaaa', confirmPassword: 'aaaaaaaa' }),
      });
      // If 403 = invalid key, 409 = key valid but email taken (meaning key works)
      // We just want to know if the key is valid
      if (res.status === 403) {
        setKeyError('Invalid invite key');
        setKeyLoading(false);
        return;
      }
      // Any other response means the key is valid (even 400 validation errors on the dummy data)
      setStep('register');
    } catch {
      // Network error - assume key might be valid, let them try
      setStep('register');
    }
    setKeyLoading(false);
  };

  // Step 2: Register with validated key
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (!name.trim()) { setRegError('Name is required'); return; }
    if (!email.includes('@')) { setRegError('Invalid email address'); return; }
    if (password.length < 8) { setRegError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setRegError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, confirmPassword, inviteKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || 'Registration failed');
        setLoading(false);
        return;
      }
      setSuccess(true);
      setTimeout(async () => {
        const { signIn } = await import('next-auth/react');
        await signIn('credentials', { email, password, redirect: false });
        router.push('/');
        router.refresh();
      }, 1500);
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  };

  // Login path
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const { signIn } = await import('next-auth/react');
      const res = await signIn('credentials', {
        email: loginEmail,
        password: loginPassword,
        redirect: false,
      });
      setLoginLoading(false);
      if (res?.error) {
        setLoginError('Invalid email or password');
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setLoginError('Something went wrong');
      setLoginLoading(false);
    }
  };

  const backToKey = () => {
    setStep('key');
    setError('');
    setLoginError('');
  };

  return (
    <Card className="border-border/50 shadow-lg">
      {/* Step 1: Invite Key */}
      {step === 'key' && (
        <>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Welcome to OpenJARVIS</CardTitle>
            <CardDescription>Enter your invite key to continue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{getErrorMessage(error)}</span>
              </div>
            )}
            {keyError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{keyError}</span>
              </div>
            )}
            <form onSubmit={handleKeySubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-key" className="text-sm">Invite Key</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="invite-key"
                    type="text"
                    placeholder="Enter your invite key"
                    value={inviteKey}
                    onChange={(e) => setInviteKey(e.target.value)}
                    required
                    className="pl-9 h-11"
                    autoFocus
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-11 gap-2" disabled={keyLoading || !inviteKey}>
                {keyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Continue
              </Button>
            </form>
            <div className="relative">
              <Separator />
              <div className="absolute inset-0 flex justify-center">
                <span className="bg-card px-3 text-xs text-muted-foreground">or</span>
              </div>
            </div>
            <Button variant="outline" className="w-full h-11 gap-2 text-sm" onClick={() => setStep('login')}>
              Sign in with existing account
            </Button>
          </CardContent>
        </>
      )}

      {/* Step 2a: Register */}
      {step === 'register' && (
        <>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Create Account</CardTitle>
            <CardDescription>Set up your OpenJARVIS account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {success ? (
              <div className="py-8 flex flex-col items-center gap-3">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <h2 className="text-lg font-semibold">Account Created</h2>
                <p className="text-sm text-muted-foreground">Signing you in...</p>
              </div>
            ) : (
              <>
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
                  <KeyRound className="h-3 w-3" />
                  <span>Key verified: {inviteKey.slice(0, 6)}...</span>
                </div>
                <form onSubmit={handleRegister} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-sm">Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="name" type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="pl-9 h-11" autoFocus />
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
                  <Button type="submit" className="w-full h-11 gap-2" disabled={loading || !name || !email || !password || !confirmPassword}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    Create Account
                  </Button>
                </form>
                <button onClick={backToKey} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                  Back to invite key
                </button>
              </>
            )}
          </CardContent>
        </>
      )}

      {/* Step 2b: Login */}
      {step === 'login' && (
        <>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Welcome back</CardTitle>
            <CardDescription>Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loginError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="you@example.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required className="pl-9 h-11" autoFocus />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type="password" placeholder="Your password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required className="pl-9 h-11" />
                </div>
              </div>
              <Button type="submit" className="w-full h-11 gap-2" disabled={loginLoading || !loginEmail || !loginPassword}>
                {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Sign In
              </Button>
            </form>
            <button onClick={backToKey} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
              Back to invite key
            </button>
          </CardContent>
        </>
      )}
    </Card>
  );
}

function AuthLoading() {
  return (
    <Card className="border-border/50 shadow-lg">
      <CardContent className="py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

export default function AuthPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full bg-emerald-500/3 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <HolographicOrb />
          <h1 className="text-2xl font-bold tracking-tight">OpenJARVIS</h1>
          <p className="text-sm text-muted-foreground mt-1">Uncensored AI Agent Dashboard</p>
        </div>

        <Suspense fallback={<AuthLoading />}>
          <AuthForm />
        </Suspense>

        <p className="text-center text-[11px] text-muted-foreground mt-6">
          Contact an administrator for an invite key
        </p>
      </div>
    </div>
  );
}
