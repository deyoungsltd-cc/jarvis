'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getProactiveTriggers,
  updateProactiveTrigger,
  getQuietHours,
  updateQuietHours,
  getVisionConfig,
  updateVisionConfig,
  getProactiveSpeechLog,
  getWakeWordLog,
  getAmbientStatus,
  startAmbientSession,
  endAmbientSession,
  interruptAmbient,
} from '@/lib/openjarvis-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Eye, EyeOff, Clock, Bell, Radio, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---- Trigger Types ----
const TRIGGER_TYPES = [
  'mission_completed',
  'mission_failed',
  'mission_blocked',
  'approval_pending',
  'budget_cap_hit',
  'error_occurred',
] as const;

export function AmbientTab() {
  const [status, setStatus] = useState<any>(null);
  const [triggers, setTriggers] = useState<Record<string, any>>({});
  const [quietHours, setQuietHours] = useState<any>(null);
  const [vision, setVision] = useState<any>(null);
  const [speechLog, setSpeechLog] = useState<any[]>([]);
  const [wakeLog, setWakeLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [s, t, q, v, l, w] = await Promise.all([
        getAmbientStatus(),
        getProactiveTriggers(),
        getQuietHours(),
        getVisionConfig(),
        getProactiveSpeechLog(20),
        getWakeWordLog(20),
      ]);
      setStatus(s);
      setTriggers(t);
      setQuietHours(q);
      setVision(v);
      setSpeechLog(Array.isArray(l) ? l : []);
      setWakeLog(Array.isArray(w) ? w : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleToggleTrigger = async (type: string, enabled: boolean) => {
    try {
      await updateProactiveTrigger(type, { enabled });
      setTriggers(prev => ({ ...prev, [type]: { ...prev[type], enabled } }));
    } catch {}
  };

  const handleToggleQuietHours = async (enabled: boolean) => {
    try {
      const updated = await updateQuietHours({ enabled });
      setQuietHours(updated);
    } catch {}
  };

  const handleToggleVision = async (enabled: boolean) => {
    try {
      const updated = await updateVisionConfig({ enabled });
      setVision(updated);
    } catch {}
  };

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading ambient settings...</div>;
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* System Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Ambient Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">State</span>
              <Badge variant={status?.hasActiveSession ? 'default' : 'secondary'} className="text-[10px]">
                {status?.state?.toUpperCase() || 'UNKNOWN'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Wake Word</span>
              <Badge variant={status?.isWakeWordActive ? 'default' : 'outline'} className="text-[10px]">
                {status?.isWakeWordActive ? 'ACTIVE' : 'OFF'}
                {status?.wakeWordEngine ? ` (${status.wakeWordEngine})` : ''}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Avatar</span>
              <Badge variant={status?.avatarState === 'connected' || status?.avatarState === 'speaking' ? 'default' : 'outline'} className="text-[10px]">
                {status?.avatarState?.toUpperCase() || 'DISCONNECTED'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Quiet Hours</span>
              <Badge variant={status?.quietHoursActive ? 'destructive' : 'outline'} className="text-[10px]">
                {status?.quietHoursActive ? 'ACTIVE' : 'OFF'}
              </Badge>
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant={status?.hasActiveSession ? 'destructive' : 'default'}
                onClick={() => {
                  if (status?.hasActiveSession) endAmbientSession();
                  else startAmbientSession();
                  setTimeout(refresh, 1000);
                }}
                className="text-xs"
              >
                {status?.hasActiveSession ? 'End Session' : 'Start Session'}
              </Button>
              {status?.hasActiveSession && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => interruptAmbient()}
                  className="text-xs"
                >
                  <Volume2 className="h-3 w-3 mr-1" /> Interrupt
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Vision Toggle */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" /> Vision Input
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs">Enable Vision</p>
                <p className="text-[10px] text-muted-foreground">Sends screen/camera to Gemini Live at {vision?.fps || 1} FPS. Off by default.</p>
              </div>
              <Switch
                checked={vision?.enabled || false}
                onCheckedChange={handleToggleVision}
              />
            </div>
            {vision?.enabled && (
              <div className="flex items-center gap-1.5 text-red-400">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-mono">VISION ACTIVE</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quiet Hours */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" /> Quiet Hours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs">Do Not Disturb</p>
                <p className="text-[10px] text-muted-foreground">
                  {quietHours?.start} — {quietHours?.end} ({quietHours?.timezone})
                </p>
              </div>
              <Switch
                checked={quietHours?.enabled || false}
                onCheckedChange={handleToggleQuietHours}
              />
            </div>
          </CardContent>
        </Card>

        {/* Proactive Speech Triggers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="h-4 w-4" /> Proactive Speech
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {TRIGGER_TYPES.map(type => (
              <div key={type} className="flex items-center justify-between">
                <div>
                  <p className="text-xs capitalize">{type.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                    {triggers?.[type]?.messageTemplate || ''}
                  </p>
                </div>
                <Switch
                  checked={triggers?.[type]?.enabled || false}
                  onCheckedChange={e => handleToggleTrigger(type, e)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Speech Log */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Radio className="h-4 w-4" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {speechLog.length === 0 && wakeLog.length === 0 && (
                <p className="text-[10px] text-muted-foreground">No recent activity</p>
              )}
              {speechLog.slice(-10).reverse().map((e: any) => (
                <div key={e.id} className="flex items-center gap-2 text-[10px]">
                  <Bell className="h-3 w-3 text-amber-400 shrink-0" />
                  <span className="text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString()}</span>
                  <span className="capitalize">{e.triggerType?.replace(/_/g, ' ')}</span>
                </div>
              ))}
              {wakeLog.slice(-5).reverse().map((e: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <Radio className={cn('h-3 w-3 shrink-0', e.detected ? 'text-emerald-400' : 'text-muted-foreground')} />
                  <span className="text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString()}</span>
                  <span>Wake: &quot;{e.keyword}&quot; ({(e.confidence * 100).toFixed(0)}%)</span>
                  {e.detected ? <Badge className="text-[8px] h-3" variant="default">FIRED</Badge> : <Badge className="text-[8px] h-3" variant="outline">rejected</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}