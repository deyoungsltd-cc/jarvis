'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { checkHealth, createMission, runAgent } from '@/lib/openjarvis-api';
import type { Mission } from '@/lib/openjarvis-types';

import { GoalInput } from '@/components/openjarvis/goal-input';
import { AgentState } from '@/components/openjarvis/agent-state';
import { ActivityTimeline } from '@/components/openjarvis/activity-timeline';
import { MissionsTab } from '@/components/openjarvis/missions-tab';
import { ToolsTab } from '@/components/openjarvis/tools-tab';
import { MemoryTab } from '@/components/openjarvis/memory-tab';
import { ChatTab } from '@/components/openjarvis/chat-tab';
import { MediaTab } from '@/components/openjarvis/media-tab';
import { SettingsTab } from '@/components/openjarvis/settings-tab';
import { ApprovalQueue } from '@/components/openjarvis/approval-queue';
import { ThemeToggle } from '@/components/openjarvis/theme-toggle';
import { TabErrorBoundary } from '@/components/openjarvis/tab-error-boundary';
import { MissionsSkeleton, ActivitySkeleton, SettingsSkeleton, ToolsSkeleton, MemorySkeleton, ApprovalsSkeleton } from '@/components/openjarvis/tab-skeletons';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot, ListTodo, Wrench, Brain, MessageSquare, Sparkles, Settings, Shield,
  LogOut, User as UserIcon, ChevronDown, AlertTriangle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// Null stub replacing useJarvisSocket (Socket.IO removed)
function useJarvisStub() {
  return {
    connected: false,
    events: [],
    currentStatus: null as string | null,
    currentMission: null,
    subscribe: (_id: string) => {},
    unsubscribe: (_id: string) => {},
    subscribedMissionId: null as string | null,
  };
}

export default function Dashboard() {
  // ─── Backend connectivity ──────────────────────────────────
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState(false);

  useEffect(() => {
    checkHealth()
      .then(() => { setBackendOk(true); setBackendError(null); })
      .catch((err) => { setBackendOk(false); setBackendError(err instanceof Error ? err.message : 'Connection failed'); });
  }, []);

  // ─── State ─────────────────────────────────────────────────
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [provider, setProvider] = useState('openrouter');
  const [sessionUser, setSessionUser] = useState<{ name?: string | null; email?: string | null; image?: string | null } | null>(null);

  const { currentStatus, currentMission } = useJarvisStub();

  const handleMissionCreated = useCallback((mission: Mission) => {
    setActiveMission(mission);
  }, []);

  const handleSelectMission = useCallback((mission: Mission) => {
    setActiveMission(mission);
  }, []);

  const effectiveMission = activeMission;
  const isExecuting = currentStatus === 'running' || false;

  // ─── Auth (dynamic import) ───────────────────────────────
  const [userRole, setUserRole] = useState<string | null>(null);
  useEffect(() => {
    import('next-auth/react').then(({ getSession }) => {
      getSession().then((s) => {
        if (s?.user) {
          setSessionUser({ name: s.user.name, email: s.user.email, image: s.user.image });
          setUserRole((s.user as Record<string, unknown>).role as string | null);
        }
      });
    });
  }, []);

  const handleSignOut = async () => {
    const { signOut } = await import('next-auth/react');
    await signOut({ callbackUrl: '/login' });
  };

  const userInitial = sessionUser?.name?.[0]?.toUpperCase() || sessionUser?.email?.[0]?.toUpperCase() || '?';

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Connection Banner — health only, no WS */}
      {backendError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-medium">Backend unavailable</span>
          <span className="text-xs opacity-80">{backendError}</span>
        </div>
      )}

      {/* ─── Header ────────────────────────────────────────── */}
      <header className="border-b border-border px-4 py-2.5 flex items-center gap-3">
        <Bot className="h-5 w-5 text-emerald-500 shrink-0" aria-hidden="true" />
        <h1 className="text-base font-semibold tracking-tight">OpenJARVIS</h1>
        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono hidden sm:inline font-medium">QWEEN</span>
        <Separator orientation="vertical" className="h-5 mx-1 hidden sm:block" />
        <span className="flex-1" />
        {backendOk && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Connected
          </span>
        )}
        <ThemeToggle />
        <Separator orientation="vertical" className="h-5 mx-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors">
              <Avatar className="h-6 w-6">
                <AvatarImage src={sessionUser?.image || ''} alt="" />
                <AvatarFallback className="text-[10px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">{userInitial}</AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium hidden sm:inline max-w-[120px] truncate">
                {sessionUser?.name || sessionUser?.email || 'User'}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium truncate">{sessionUser?.name || 'User'}</p>
              <p className="text-xs text-muted-foreground truncate">{sessionUser?.email}</p>
            </div>
            <DropdownMenuSeparator />
            {userRole === 'admin' && (
              <DropdownMenuItem onClick={() => window.location.href = '/admin'} className="text-xs gap-2 cursor-pointer">
                <Shield className="h-3.5 w-3.5" />
                Admin Panel
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-xs gap-2 text-destructive focus:text-destructive cursor-pointer">
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* ─── Main Content ──────────────────────────────────── */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Panel */}
        <aside className="w-full lg:w-80 xl:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-border flex flex-col">
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-4 p-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">New Mission</CardTitle>
                </CardHeader>
                <CardContent>
                  <GoalInput onMissionCreated={handleMissionCreated} disabled={isExecuting} provider={provider} />
                </CardContent>
              </Card>

              <div>
                <h2 className="text-sm font-medium mb-3">Agent State</h2>
                <AgentState mission={effectiveMission} wsStatus={currentStatus} wsData={currentMission} wsConnected={backendOk} />
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* Center Panel — Tabbed */}
        <section className="flex-1 flex flex-col min-w-0">
          <Tabs defaultValue="chat" className="flex flex-col h-full">
            <div className="px-4 pt-2 border-b border-border">
              <TabsList className="h-9">
                <TabsTrigger value="chat" className="text-xs gap-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Chat
                </TabsTrigger>
                <TabsTrigger value="activity" className="text-xs gap-1">
                  <ListTodo className="h-3.5 w-3.5" />
                  Activity
                </TabsTrigger>
                <TabsTrigger value="media" className="text-xs gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  Media
                </TabsTrigger>
                <TabsTrigger value="tools" className="text-xs gap-1">
                  <Wrench className="h-3.5 w-3.5" />
                  Tools
                </TabsTrigger>
                <TabsTrigger value="memory" className="text-xs gap-1">
                  <Brain className="h-3.5 w-3.5" />
                  Memory
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs gap-1">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </TabsTrigger>
                <TabsTrigger value="approvals" className="text-xs gap-1 relative">
                  <Shield className="h-3.5 w-3.5" />
                  Approvals
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="chat" className="flex-1 min-h-0 overflow-hidden">
              <TabErrorBoundary label="Chat">
                <ChatTab />
              </TabErrorBoundary>
            </TabsContent>

            <TabsContent value="activity" className="flex-1 min-h-0 overflow-hidden">
              <TabErrorBoundary label="Activity">
                <div className="px-4 py-2 border-b border-border">
                  <h2 className="text-sm font-semibold">Activity</h2>
                </div>
                <ActivityTimeline events={[]} missionId={null} />
              </TabErrorBoundary>
            </TabsContent>

            <TabsContent value="media" className="flex-1 min-h-0 overflow-auto">
              <TabErrorBoundary label="Media">
                <MediaTab />
              </TabErrorBoundary>
            </TabsContent>

            <TabsContent value="tools" className="flex-1 min-h-0 overflow-auto">
              <TabErrorBoundary label="Tools">
                <React.Suspense fallback={<ToolsSkeleton />}>
                  <ToolsTab />
                </React.Suspense>
              </TabErrorBoundary>
            </TabsContent>

            <TabsContent value="memory" className="flex-1 min-h-0 overflow-auto">
              <TabErrorBoundary label="Memory">
                <React.Suspense fallback={<MemorySkeleton />}>
                  <MemoryTab />
                </React.Suspense>
              </TabErrorBoundary>
            </TabsContent>

            <TabsContent value="settings" className="flex-1 min-h-0 overflow-auto">
              <TabErrorBoundary label="Settings">
                <React.Suspense fallback={<SettingsSkeleton />}>
                  <SettingsTab provider={provider} onProviderChange={setProvider} />
                </React.Suspense>
              </TabErrorBoundary>
            </TabsContent>

            <TabsContent value="approvals" className="flex-1 min-h-0 overflow-y-auto">
              <TabErrorBoundary label="Approvals">
                <React.Suspense fallback={<ApprovalsSkeleton />}>
                  <ApprovalQueue />
                </React.Suspense>
              </TabErrorBoundary>
            </TabsContent>
          </Tabs>
        </section>

        {/* Right Panel — Missions */}
        <aside className="w-full lg:w-80 xl:w-96 shrink-0 border-t lg:border-t-0 lg:border-l border-border flex flex-col">
          <div className="px-3 pt-3 pb-1">
            <h2 className="text-sm font-medium">Missions</h2>
          </div>
          <TabErrorBoundary label="Missions">
            <React.Suspense fallback={<MissionsSkeleton />}>
              <MissionsTab onSelectMission={handleSelectMission} activeMissionId={null} />
            </React.Suspense>
          </TabErrorBoundary>
        </aside>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground mt-auto">
        <div className="flex items-center justify-between gap-2">
          <span>OpenJARVIS — Powered by <span className="text-emerald-600 dark:text-emerald-400 font-medium">Qween</span> (Uncensored)</span>
          <span className="font-mono">v5.2</span>
        </div>
      </footer>
    </div>
  );
}
