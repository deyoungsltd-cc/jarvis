'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useJarvisSocket } from '@/hooks/useJarvisSocket';
import { checkHealth, createMission, runAgent } from '@/lib/openjarvis-api';
import type { Mission } from '@/lib/openjarvis-types';

import { GoalInput } from '@/components/openjarvis/goal-input';
import { AgentState } from '@/components/openjarvis/agent-state';
import { ActivityTimeline } from '@/components/openjarvis/activity-timeline';
import { MissionsTab } from '@/components/openjarvis/missions-tab';
import { ToolsTab } from '@/components/openjarvis/tools-tab';
import { MemoryTab } from '@/components/openjarvis/memory-tab';
import { SettingsTab } from '@/components/openjarvis/settings-tab';
import { VoiceControl } from '@/components/openjarvis/voice-control';
import { ConnectionBanner } from '@/components/openjarvis/Connection-banner';
import { ApprovalQueue, ApprovalBadge } from '@/components/openjarvis/approval-queue';
import { OnboardingWizard, useOnboarding } from '@/components/openjarvis/onboarding-wizard';
import { ThemeToggle } from '@/components/openjarvis/theme-toggle';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, ListTodo, Wrench, Brain, Settings, Shield } from 'lucide-react';

export default function Dashboard() {
  // ─── Onboarding ────────────────────────────────────────────
  const { shouldShow: showOnboarding } = useOnboarding();

  // ─── Backend connectivity ──────────────────────────────────
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState(false);

  useEffect(() => {
    checkHealth()
      .then(() => {
        setBackendOk(true);
        setBackendError(null);
      })
      .catch((err) => {
        setBackendOk(false);
        setBackendError(err instanceof Error ? err.message : 'Connection failed');
      });
  }, []);

  // ─── State ─────────────────────────────────────────────────
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [provider, setProvider] = useState('gemini');

  const {
    connected: wsConnected,
    events: wsEvents,
    currentStatus: wsStatus,
    currentMission: wsData,
    subscribe,
    subscribedMissionId,
  } = useJarvisSocket();

  // When a mission is created, subscribe to its WebSocket channel
  const handleMissionCreated = useCallback(
    (mission: Mission) => {
      setActiveMission(mission);
      subscribe(mission.id);
    },
    [subscribe]
  );

  // When selecting a mission from the Missions tab
  const handleSelectMission = useCallback(
    (mission: Mission) => {
      setActiveMission(mission);
      subscribe(mission.id);
    },
    [subscribe]
  );

  // Derive the effective mission display from base + ws updates
  const effectiveMission = useMemo(() => {
    if (!activeMission) return null;
    if (!wsData || subscribedMissionId !== activeMission.id) return activeMission;
    return { ...activeMission, ...wsData };
  }, [activeMission, wsData, subscribedMissionId]);

  // ─── Approval State (Phase 10) ─────────────────────────
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [showApprovalPanel, setShowApprovalPanel] = useState(false);

  const isExecuting = wsStatus === 'running';

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Onboarding Wizard Overlay */}
      {showOnboarding && <OnboardingWizard />}
      {/* Connection Banner */}
      <ConnectionBanner backendError={backendError} wsConnected={wsConnected} />

      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Bot className="h-6 w-6 text-emerald-500" aria-hidden="true" />
        <h1 className="text-lg font-semibold tracking-tight">OpenJarvis</h1>
        <span className="flex-1" />
        {wsConnected && backendOk && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Connected
          </span>
        )}
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-0 overflow-hidden">
        {/* ─── Left Panel ─────────────────────────────────── */}
        <aside className="w-full lg:w-80 xl:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-border flex flex-col">
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-4 p-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">New Mission</CardTitle>
                </CardHeader>
                <CardContent>
                  <GoalInput
                    onMissionCreated={handleMissionCreated}
                    disabled={isExecuting}
                    provider={provider}
                  />
                </CardContent>
              </Card>

              {/* Phase 5: Voice Input */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Voice Input</CardTitle>
                </CardHeader>
                <CardContent>
                  <VoiceControl
                    onTranscript={async (text) => {
                      // When voice transcript arrives, create a real mission via API
                      if (text.trim() && !isExecuting) {
                        try {
                          const mission = await createMission({ goal: text.trim(), provider });
                          handleMissionCreated(mission);
                          await runAgent({ missionId: mission.id, provider });
                        } catch {}
                      }
                    }}
                    disabled={isExecuting}
                  />
                </CardContent>
              </Card>

              <Separator />

              <div>
                <h2 className="text-sm font-medium mb-3">Agent State</h2>
                <AgentState
                  mission={effectiveMission}
                  wsStatus={wsStatus}
                  wsData={wsData}
                  wsConnected={wsConnected}
                />
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* ─── Center Panel ───────────────────────────────── */}
        <section className="flex-1 flex flex-col min-w-0" aria-label="Activity Timeline">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <h2 className="text-sm font-semibold">Activity</h2>
            {subscribedMissionId && (
              <span className="text-xs text-muted-foreground font-mono">
                {subscribedMissionId.slice(0, 8)}
              </span>
            )}
          </div>
          <ActivityTimeline
            events={wsEvents}
            missionId={subscribedMissionId}
          />
        </section>

        {/* ─── Right Panel ────────────────────────────────── */}
        <aside className="w-full lg:w-80 xl:w-96 shrink-0 border-t lg:border-t-0 lg:border-l border-border flex flex-col">
          <Tabs defaultValue="missions" className="flex flex-col h-full">
            <div className="px-2 pt-2">
              <TabsList className="w-full grid grid-cols-5">
                <TabsTrigger value="missions" className="text-xs gap-1">
                  <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Missions</span>
                </TabsTrigger>
                <TabsTrigger value="tools" className="text-xs gap-1">
                  <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Tools</span>
                </TabsTrigger>
                <TabsTrigger value="memory" className="text-xs gap-1">
                  <Brain className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Memory</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs gap-1">
                  <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Settings</span>
                </TabsTrigger>
                <TabsTrigger value="approvals" className="text-xs gap-1 relative">
                  <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Approvals</span>
                  {pendingApprovals > 0 && (
                    <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold">
                      {pendingApprovals > 9 ? '9+' : pendingApprovals}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="missions" className="flex-1 min-h-0">
              <MissionsTab
                onSelectMission={handleSelectMission}
                activeMissionId={subscribedMissionId}
              />
            </TabsContent>

            <TabsContent value="tools" className="flex-1 min-h-0">
              <ToolsTab />
            </TabsContent>

            <TabsContent value="memory" className="flex-1 min-h-0">
              <MemoryTab />
            </TabsContent>

            <TabsContent value="settings" className="flex-1 min-h-0">
              <SettingsTab provider={provider} onProviderChange={setProvider} />
            </TabsContent>

            <TabsContent value="approvals" className="flex-1 min-h-0 overflow-y-auto">
              <ApprovalQueue />
            </TabsContent>
          </Tabs>
        </aside>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground mt-auto">
        <div className="flex items-center justify-between gap-2">
          <span>OpenJarvis Agent Dashboard</span>
          <span className="font-mono">v3.0</span>
        </div>
      </footer>
    </div>
  );
}
