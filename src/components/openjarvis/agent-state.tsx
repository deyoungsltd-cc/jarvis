'use client';

import type { Mission, MissionStatus } from '@/lib/openjarvis-types';
import { getStatusConfig } from '@/lib/status-utils';
import { Badge } from '@/components/ui/badge';
import {
  Circle,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Pause,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentStateProps {
  mission: Mission | null;
  wsStatus: MissionStatus | null;
  wsData: Partial<Mission> | null;
  wsConnected: boolean;
}

export function AgentState({ mission, wsStatus, wsData, wsConnected }: AgentStateProps) {
  const effectiveStatus = wsStatus ?? mission?.status ?? null;
  if (!effectiveStatus) {
    return (
      <div className="flex flex-col gap-3 p-4 rounded-lg border border-dashed border-muted-foreground/20">
        <p className="text-sm text-muted-foreground">No active mission</p>
        <p className="text-xs text-muted-foreground">
          Enter a goal above to start the agent.
        </p>
      </div>
    );
  }

  const cfg = getStatusConfig(effectiveStatus);
  const tokenCount = wsData?.tokenCount ?? mission?.tokenCount ?? null;
  const toolCallCount = wsData?.toolCallCount ?? mission?.toolCallCount ?? null;
  const error = wsData?.error ?? mission?.error ?? null;
  const isReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const StateIcon =
    cfg.state === 'executing'
      ? isReducedMotion
        ? Loader2
        : Circle
      : cfg.state === 'success'
        ? CheckCircle2
        : cfg.state === 'waiting' || cfg.state === 'paused'
          ? Pause
          : cfg.state === 'error'
            ? AlertCircle
            : Circle;

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg border border-border">
      {/* Status line */}
      <div className="flex items-center gap-2">
        <StateIcon
          className={cn(
            'h-4 w-4',
            cfg.iconClass,
            cfg.state === 'executing' && !isReducedMotion && 'animate-pulse'
          )}
          aria-hidden="true"
        />
        <span className={cn('text-sm font-medium', cfg.iconClass)}>
          {cfg.label}
        </span>
        <Badge variant="outline" className={getMissionStatusBadgeClasses(effectiveStatus)}>
          {effectiveStatus}
        </Badge>
      </div>

      {/* Goal */}
      {mission && (
        <p className="text-sm text-foreground break-words line-clamp-3">
          {mission.goal}
        </p>
      )}

      {/* Stats */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        {tokenCount !== null && (
          <span>
            <strong className="text-foreground font-medium">{tokenCount.toLocaleString()}</strong> tokens
          </span>
        )}
        {toolCallCount !== null && (
          <span>
            <strong className="text-foreground font-medium">{toolCallCount}</strong> tool calls
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/20"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs text-red-600 dark:text-red-400 break-words">{error}</p>
        </div>
      )}
    </div>
  );
}

function getMissionStatusBadgeClasses(status: MissionStatus): string {
  const map: Record<string, string> = {
    running: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    waiting_approval: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    blocked: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
    failed: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
    completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    paused: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  };
  return map[status] ?? 'border-gray-400/40 bg-gray-500/10 text-gray-600 dark:text-gray-400';
}
