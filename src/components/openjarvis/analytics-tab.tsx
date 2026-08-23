'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAnalytics } from '@/lib/openjarvis-api';
import type { Analytics } from '@/lib/openjarvis-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Target, CheckCircle2, Monitor, Zap } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
  running: 'bg-amber-500',
  queued: 'bg-sky-500',
  draft: 'bg-zinc-400',
  cancelled: 'bg-zinc-500',
  paused: 'bg-orange-400',
  blocked: 'bg-rose-400',
  waiting_approval: 'bg-yellow-500',
  expired: 'bg-zinc-600',
};

const PROVIDER_COLORS = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-pink-500',
];

export function AnalyticsTab() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAnalytics();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading analytics" />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-500" role="alert">{error || 'No analytics data available'}</p>
        <button className="mt-2 text-xs text-primary underline" onClick={fetchAnalytics}>Retry</button>
      </div>
    );
  }

  const successRate = analytics.totalMissions > 0
    ? Math.round(((analytics.missionsByStatus['completed'] || 0) / analytics.totalMissions) * 100)
    : 0;

  const statusEntries = Object.entries(analytics.missionsByStatus).sort((a, b) => b[1] - a[1]);
  const statusTotal = statusEntries.reduce((s, [, v]) => s + v, 0);

  const providerEntries = Object.entries(analytics.missionsByProvider).sort((a, b) => b[1] - a[1]);
  const providerMax = providerEntries.length > 0 ? providerEntries[0][1] : 1;

  const dailyEntries = analytics.dailyMissionCounts.slice(-14);
  const dailyMax = dailyEntries.length > 0 ? Math.max(...dailyEntries.map((d) => d.count), 1) : 1;

  const toolEntries = Object.entries(analytics.toolUsageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const toolMax = toolEntries.length > 0 ? toolEntries[0][1] : 1;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <ScrollArea className="h-full max-h-96 lg:max-h-full">
      <div className="flex flex-col gap-6 p-1">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" /> Total Missions
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-2xl font-bold">{analytics.totalMissions}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-2xl font-bold">{successRate}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5" /> Active Devices
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-2xl font-bold">
                {analytics.onlineDevices}<span className="text-sm font-normal text-muted-foreground">/{analytics.totalDevices}</span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" /> Total Macros
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-2xl font-bold">{analytics.totalMacros}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Missions by Status - Pie-like stacked bar */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm">Missions by Status</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {statusEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No data</p>
              ) : (
                <div className="space-y-3">
                  {/* Stacked bar */}
                  <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
                    {statusEntries.map(([status, count]) => (
                      <div
                        key={status}
                        className={`${STATUS_COLORS[status] || 'bg-zinc-400'} transition-all`}
                        style={{ width: `${(count / statusTotal) * 100}%` }}
                        title={`${status}: ${count}`}
                      />
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {statusEntries.map(([status, count]) => (
                      <div key={status} className="flex items-center gap-1.5">
                        <div className={`h-2.5 w-2.5 rounded-sm ${STATUS_COLORS[status] || 'bg-zinc-400'}`} />
                        <span className="text-[11px] text-muted-foreground capitalize">{status.replace(/_/g, ' ')}</span>
                        <span className="text-[11px] font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Missions by Provider - Horizontal bars */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm">Missions by Provider</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {providerEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No data</p>
              ) : (
                <div className="space-y-2">
                  {providerEntries.map(([provider, count], i) => (
                    <div key={provider} className="flex items-center gap-2">
                      <span className="text-xs w-[100px] truncate text-right text-muted-foreground">{provider}</span>
                      <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                        <div
                          className={`h-full ${PROVIDER_COLORS[i % PROVIDER_COLORS.length]} rounded-sm transition-all`}
                          style={{ width: `${(count / providerMax) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium w-8 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Daily Activity - Vertical bar chart */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm">Daily Activity (Last 14 days)</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {dailyEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No data</p>
              ) : (
                <div className="flex items-end gap-1 h-[120px]">
                  {dailyEntries.map((entry) => (
                    <div key={entry.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <span className="text-[9px] text-muted-foreground font-medium">{entry.count}</span>
                      <div
                        className="w-full bg-primary/80 rounded-t-sm transition-all min-h-[2px]"
                        style={{ height: `${(entry.count / dailyMax) * 100}%` }}
                      />
                      <span className="text-[9px] text-muted-foreground">{formatDate(entry.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tool Usage Top 5 */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm">Tool Usage (Top 5)</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {toolEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No data</p>
              ) : (
                <div className="space-y-2">
                  {toolEntries.map(([tool, count], i) => (
                    <div key={tool} className="flex items-center gap-2">
                      <span className="text-xs w-[100px] truncate text-right text-muted-foreground">{tool}</span>
                      <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                        <div
                          className={`h-full ${PROVIDER_COLORS[i % PROVIDER_COLORS.length]} rounded-sm transition-all`}
                          style={{ width: `${(count / toolMax) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium w-8 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
}
