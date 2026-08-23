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
import { ApprovalQueue } from '@/components/openjarvis/approval-queue';
import { OnboardingWizard, useOnboarding } from '@/components/openjarvis/onboarding-wizard';
import { ThemeToggle } from '@/components/openjarvis/theme-toggle';
import { WorkspaceSwitcher } from '@/components/openjarvis/workspace-switcher';
import { DaemonStatus } from '@/components/openjarvis/daemon-status';
import { ExportDialog } from '@/components/openjarvis/export-dialog';
import { AuditTab } from '@/components/openjarvis/audit-tab';
import { AnalyticsTab } from '@/components/openjarvis/analytics-tab';
import { MacroTab } from '@/components/openjarvis/macro-tab';
import { DeviceTab } from '@/components/openjarvis/device-tab';
import { RagTab } from '@/components/openjarvis/rag-tab';
import { SchedulerTab } from '@/components/openjarvis/scheduler-tab';
import { WebhookTab } from '@/components/openjarvis/webhook-tab';
import { PluginTab } from '@/components/openjarvis/plugin-tab';
import { VaultTab } from '@/components/openjarvis/vault-tab';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot, ListTodo, Wrench, Brain, Settings, Shield,
  BarChart3, Clock, FileText, Zap, Monitor, Plug,
  Webhook, Lock, FolderSearch, ClipboardList, Building2,
} from 'lucide-react';

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
  const [showExport, setShowExport] = useState(false);

  const {
    connected: wsConnected,
    events: wsEvents,
    currentStatus: wsStatus,
    currentMission: wsData,
    subscribe,
    subscribedMissionId,
  } = useJarvisSocket();

  const handleMissionCreated = useCallback(
    (mission: Mission) => {
      setActiveMission(mission);
      subscribe(mission.id);
    },
    [subscribe]
  );

  const handleSelectMission = useCallback(
    (mission: Mission) => {
      setActiveMission(mission);
      subscribe(mission.id);
    },
    [subscribe]
  );

  const effectiveMission = useMemo(() => {
    if (!activeMission) return null;
    if (!wsData || subscribedMissionId !== activeMission.id) return activeMission;
    return { ...activeMission, ...wsData };
  }, [activeMission, wsData, subscribedMissionId]);

  const [pendingApprovals, setPendingApprovals] = useState(0);

  const isExecuting = wsStatus === 'running';

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {showOnboarding && <OnboardingWizard />}
      <ConnectionBanner backendError={backendError} wsConnected={wsConnected} />

      {/* ─── Header ────────────────────────────────────────── */}
      <header className="border-b border-border px-4 py-2.5 flex items-center gap-3">
        <Bot className="h-5 w-5 text-emerald-500 shrink-0" aria-hidden="true" />
        <h1 className="text-base font-semibold tracking-tight">OpenJarvis</h1>
        <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">Qwen3.8-27B-Uncensored</span>
        <Separator orientation="vertical" className="h-5 mx-1 hidden sm:block" />
        <WorkspaceSwitcher />
        <span className="flex-1" />
        <DaemonStatus />
        {wsConnected && backendOk && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Connected
          </span>
        )}
        <button
          onClick={() => setShowExport(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
        >
          Export
        </button>
        <ThemeToggle />
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
                  <GoalInput
                    onMissionCreated={handleMissionCreated}
                    disabled={isExecuting}
                    provider={provider}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Voice Input</CardTitle>
                </CardHeader>
                <CardContent>
                  <VoiceControl
                    onTranscript={async (text) => {
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

        {/* Center Panel — Tabbed */}
        <section className="flex-1 flex flex-col min-w-0">
          <Tabs defaultValue="activity" className="flex flex-col h-full">
            <div className="px-4 pt-2 border-b border-border">
              <TabsList className="h-9">
                <TabsTrigger value="activity" className="text-xs gap-1">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Activity
                </TabsTrigger>
                <TabsTrigger value="analytics" className="text-xs gap-1">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Analytics
                </TabsTrigger>
                <TabsTrigger value="audit" className="text-xs gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Audit Log
                </TabsTrigger>
                <TabsTrigger value="macros" className="text-xs gap-1">
                  <Zap className="h-3.5 w-3.5" />
                  Macros
                </TabsTrigger>
                <TabsTrigger value="devices" className="text-xs gap-1">
                  <Monitor className="h-3.5 w-3.5" />
                  Devices
                </TabsTrigger>
                <TabsTrigger value="rag" className="text-xs gap-1">
                  <FolderSearch className="h-3.5 w-3.5" />
                  RAG
                </TabsTrigger>
                <TabsTrigger value="scheduler" className="text-xs gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Scheduler
                </TabsTrigger>
                <TabsTrigger value="webhooks" className="text-xs gap-1">
                  <Webhook className="h-3.5 w-3.5" />
                  Webhooks
                </TabsTrigger>
                <TabsTrigger value="plugins" className="text-xs gap-1">
                  <Plug className="h-3.5 w-3.5" />
                  Plugins
                </TabsTrigger>
                <TabsTrigger value="vault" className="text-xs gap-1">
                  <Lock className="h-3.5 w-3.5" />
                  Vault
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="activity" className="flex-1 min-h-0 overflow-hidden">
              <div className="px-4 py-2 flex items-center gap-2 border-b border-border">
                <h2 className="text-sm font-semibold">Activity</h2>
                {subscribedMissionId && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {subscribedMissionId.slice(0, 8)}
                  </span>
                )}
              </div>
              <ActivityTimeline events={wsEvents} missionId={subscribedMissionId} />
            </TabsContent>

            <TabsContent value="analytics" className="flex-1 min-h-0 overflow-auto">
              <AnalyticsTab />
            </TabsContent>

            <TabsContent value="audit" className="flex-1 min-h-0 overflow-auto">
              <AuditTab />
            </TabsContent>

            <TabsContent value="macros" className="flex-1 min-h-0 overflow-auto">
              <MacroTab />
            </TabsContent>

            <TabsContent value="devices" className="flex-1 min-h-0 overflow-auto">
              <DeviceTab />
            </TabsContent>

            <TabsContent value="rag" className="flex-1 min-h-0 overflow-auto">
              <RagTab />
            </TabsContent>

            <TabsContent value="scheduler" className="flex-1 min-h-0 overflow-auto">
              <SchedulerTab />
            </TabsContent>

            <TabsContent value="webhooks" className="flex-1 min-h-0 overflow-auto">
              <WebhookTab />
            </TabsContent>

            <TabsContent value="plugins" className="flex-1 min-h-0 overflow-auto">
              <PluginTab />
            </TabsContent>

            <TabsContent value="vault" className="flex-1 min-h-0 overflow-auto">
              <VaultTab />
            </TabsContent>
          </Tabs>
        </section>

        {/* Right Panel */}
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

      {/* Export Dialog */}
      {showExport && <ExportDialog open={showExport} onOpenChange={setShowExport} />}

      {/* Footer */}
      <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground mt-auto">
        <div className="flex items-center justify-between gap-2">
          <span>OpenJarvis — Powered by Qwen3.8-27B-Uncensored</span>
          <span className="font-mono">v5.0</span>
        </div>
      </footer>
    </div>
  );
}
