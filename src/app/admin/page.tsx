'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users, KeyRound, Shield, Activity, Loader2, Search,
  Lock, Unlock, Trash2, Plus, Copy, Check, RefreshCw,
  UserPlus, AlertTriangle, ArrowLeft, Eye, EyeOff,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

// ─── Types ─────────────────────────────────────────────
interface AdminUser {
  id: string; name: string | null; email: string | null; role: string;
  frozen: boolean; sessionVersion: number; createdAt: string; updatedAt: string;
}
interface InviteKeyData {
  id: string; code: string; createdBy: string; usedBy: string | null;
  maxUses: number; useCount: number; expiresAt: string | null; active: boolean;
  createdAt: string; creator: { name: string | null; email: string | null };
}
interface AdminStats {
  totalUsers: number; adminCount: number; frozenCount: number;
  totalMissions: number; activeMissions: number; completedMissions: number;
  totalKeys: number; activeKeys: number;
  recentUsers: AdminUser[]; recentAuditLogs: Array<{ id: string; action: string; detail: string | null; createdAt: string }>;
}

// ─── Admin Gate ─────────────────────────────────────────
function useAdminGate() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    import('next-auth/react').then(({ getSession }) => {
      getSession().then((s) => {
        const role = (s?.user as Record<string, unknown>)?.role as string | undefined;
        setIsAdmin(role === 'admin');
      });
    });
  }, []);
  return isAdmin;
}

// ─── Copy Button ────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copy}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

// ─── Stats Overview ─────────────────────────────────────
function StatsGrid({ stats }: { stats: AdminStats }) {
  const cards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users },
    { label: 'Admins', value: stats.adminCount, icon: Shield },
    { label: 'Frozen', value: stats.frozenCount, icon: Lock },
    { label: 'Active Keys', value: `${stats.activeKeys}/${stats.totalKeys}`, icon: KeyRound },
    { label: 'Missions', value: stats.totalMissions, icon: Activity },
    { label: 'Running', value: stats.activeMissions, icon: RefreshCw },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10"><c.icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /></div>
            <div><p className="text-xs text-muted-foreground">{c.label}</p><p className="text-lg font-bold">{c.value}</p></div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Users Tab ──────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchUsers = useCallback(async (p: number, s: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?page=${p}&limit=20&search=${encodeURIComponent(s)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUsers(data.users);
      setTotalPages(data.pages);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(page, search); }, [page, search, fetchUsers]);

  const toggleFreeze = async (user: AdminUser) => {
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frozen: !user.frozen }),
      });
      if (res.ok) fetchUsers(page, search);
    } catch {}
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Delete this user permanently?')) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      if (res.ok) fetchUsers(page, search);
    } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9 h-9" />
        </div>
        <CreateUserDialog onCreated={() => fetchUsers(page, search)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <Card key={user.id} className="border-border/50">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{user.name || user.email}</span>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] h-5">{user.role}</Badge>
                    {user.frozen && <Badge variant="destructive" className="text-[10px] h-5">Frozen</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  <p className="text-[10px] text-muted-foreground">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleFreeze(user)} title={user.frozen ? 'Unfreeze' : 'Freeze'}>
                    {user.frozen ? <Unlock className="h-3.5 w-3.5 text-emerald-500" /> : <Lock className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteUser(user.id)} title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {users.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No users found</p>}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create User Dialog ─────────────────────────────────
function CreateUserDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) { setError('Email and password required'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); setLoading(false); return; }
      setOpen(false); setName(''); setEmail(''); setPassword(''); setRole('user');
      onCreated();
    } catch { setError('Something went wrong'); }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" /> Create User
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Create User</DialogTitle><DialogDescription>Manually create a new account</DialogDescription></DialogHeader>
        <div className="space-y-3">
          {error && <div className="text-sm text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />{error}</div>}
          <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" className="h-9" /></div>
          <div className="space-y-1"><Label className="text-xs">Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" /></div>
          <div className="space-y-1">
            <Label className="text-xs">Password</Label>
            <div className="relative"><Input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="h-9 pr-9" />
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setShowPw(!showPw)}>{showPw ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}</button></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Role</Label>
            <div className="flex gap-2">
              <Button variant={role === 'user' ? 'default' : 'outline'} size="sm" className="flex-1 h-8" onClick={() => setRole('user')}>User</Button>
              <Button variant={role === 'admin' ? 'default' : 'outline'} size="sm" className="flex-1 h-8" onClick={() => setRole('admin')}>Admin</Button>
            </div>
          </div>
        </div>
        <DialogFooter><Button onClick={handleSubmit} disabled={loading || !email || !password} className="w-full">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invite Keys Tab ────────────────────────────────────
function InviteKeysTab() {
  const [keys, setKeys] = useState<InviteKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [genCount, setGenCount] = useState('1');
  const [genMaxUses, setGenMaxUses] = useState('1');
  const [generating, setGenerating] = useState(false);
  const [newKeys, setNewKeys] = useState<string[]>([]);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/invite-keys?limit=50');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setKeys(data.keys);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const generateKeys = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/invite-keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: parseInt(genCount) || 1, maxUses: parseInt(genMaxUses) || 1 }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKeys(data.keys.map((k: InviteKeyData) => k.code));
        fetchKeys();
      }
    } catch {}
    setGenerating(false);
  };

  return (
    <div className="space-y-4">
      {/* Generator */}
      <Card className="border-border/50">
        <CardHeader className="pb-3"><CardTitle className="text-sm">Generate Invite Keys</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-1"><Label className="text-xs">Count</Label><Input type="number" min="1" max="50" value={genCount} onChange={(e) => setGenCount(e.target.value)} className="w-20 h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">Max Uses Each</Label><Input type="number" min="1" max="1000" value={genMaxUses} onChange={(e) => setGenMaxUses(e.target.value)} className="w-24 h-9" /></div>
            <Button onClick={generateKeys} disabled={generating} className="gap-1.5 h-9">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Generate
            </Button>
          </div>
          {newKeys.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-1">
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">New keys generated:</p>
              {newKeys.map((k, i) => (
                <div key={i} className="flex items-center gap-2"><code className="text-xs bg-background px-2 py-0.5 rounded flex-1 font-mono">{k}</code><CopyBtn text={k} /></div>
              ))}
              <Button variant="ghost" size="sm" className="text-xs mt-1" onClick={() => setNewKeys([])}>Clear</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Keys List */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <Card key={key.id} className={`border-border/50 ${!key.active ? 'opacity-50' : ''}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{key.code}</code>
                    <CopyBtn text={key.code} />
                    <Badge variant={key.active ? 'default' : 'secondary'} className="text-[10px] h-5">{key.active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span>Uses: {key.useCount}/{key.maxUses}</span>
                    {key.expiresAt && <span>Expires: {new Date(key.expiresAt).toLocaleDateString()}</span>}
                    <span>By: {key.creator.email || key.creator.name || 'Unknown'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {keys.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No invite keys yet</p>}
        </div>
      )}
    </div>
  );
}

// ─── Audit Tab ──────────────────────────────────────────
function AuditTab({ stats }: { stats: AdminStats | null }) {
  return (
    <div className="space-y-2">
      {stats?.recentAuditLogs && stats.recentAuditLogs.length > 0 ? (
        stats.recentAuditLogs.map((log) => (
          <Card key={log.id} className="border-border/50">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] h-5 font-mono">{log.action}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate font-mono">{log.detail || 'No details'}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(log.createdAt).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">No audit logs</p>
      )}
    </div>
  );
}

// ─── Main Admin Page ────────────────────────────────────
export default function AdminPage() {
  const isAdmin = useAdminGate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/admin/stats').then(r => r.ok ? r.json() : null).then(setStats).finally(() => setStatsLoading(false));
    }
  }, [isAdmin]);

  if (isAdmin === null || statsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-sm border-destructive/50">
          <CardContent className="py-8 flex flex-col items-center gap-3">
            <Shield className="h-8 w-8 text-destructive" />
            <h2 className="text-lg font-semibold">Access Denied</h2>
            <p className="text-sm text-muted-foreground text-center">Admin access required</p>
            <Button variant="outline" className="mt-2" onClick={() => (window.location.href = '/')}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border px-4 py-2.5 flex items-center gap-3">
        <Shield className="h-5 w-5 text-emerald-500" />
        <h1 className="text-base font-semibold tracking-tight">Admin Panel</h1>
        <Separator orientation="vertical" className="h-5" />
        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => (window.location.href = '/')}>
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Button>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
        {stats && <div className="mb-6"><StatsGrid stats={stats} /></div>}

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="h-9">
            <TabsTrigger value="users" className="text-xs gap-1"><Users className="h-3.5 w-3.5" /> Users</TabsTrigger>
            <TabsTrigger value="keys" className="text-xs gap-1"><KeyRound className="h-3.5 w-3.5" /> Invite Keys</TabsTrigger>
            <TabsTrigger value="audit" className="text-xs gap-1"><Activity className="h-3.5 w-3.5" /> Audit Log</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
          <TabsContent value="keys" className="mt-4"><InviteKeysTab /></TabsContent>
          <TabsContent value="audit" className="mt-4"><AuditTab stats={stats} /></TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground mt-auto">
        OpenJARVIS Admin Panel
      </footer>
    </div>
  );
}