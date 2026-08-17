'use client';

import { useEffect, useRef } from 'react';
import type { MissionEvent } from '@/lib/openjarvis-types';
import { getEventTypeColor } from '@/lib/status-utils';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Brain,
  ListChecks,
  Wrench,
  Play,
  Eye,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Wallet,
  Database,
  ArrowUpDown,
  Activity,
} from 'lucide-react';

interface ActivityTimelineProps {
  events: MissionEvent[];
  missionId: string | null;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  interpret: 'Interpret',
  plan: 'Plan',
  tool_select: 'Tool Select',
  tool_execute: 'Tool Execute',
  observe: 'Observe',
  verify: 'Verify',
  complete: 'Complete',
  error: 'Error',
  budget_exceeded: 'Budget Exceeded',
  memory_update: 'Memory Update',
  status_change: 'Status Change',
  custom: 'Custom',
};

const EVENT_TYPE_ICONS: Record<string, React.ElementType> = {
  interpret: Brain,
  plan: ListChecks,
  tool_select: Wrench,
  tool_execute: Play,
  observe: Eye,
  verify: ShieldCheck,
  complete: CheckCircle2,
  error: AlertCircle,
  budget_exceeded: Wallet,
  memory_update: Database,
  status_change: ArrowUpDown,
  custom: Activity,
};

function summarizePayload(payload: Record<string, unknown>): string {
  if (!payload || Object.keys(payload).length === 0) return '';
  try {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(payload)) {
      if (key === 'type' || key === 'missionId') continue;
      const str =
        typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      // Truncate long values
      const truncated = str.length > 200 ? str.slice(0, 200) + '…' : str;
      lines.push(`${key}: ${truncated}`);
    }
    return lines.join('\n');
  } catch {
    return JSON.stringify(payload);
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function EventItem({ event, isLatest }: { event: MissionEvent; isLatest: boolean }) {
  const colors = getEventTypeColor(event.type);
  const Icon = EVENT_TYPE_ICONS[event.type] ?? Activity;
  const label = EVENT_TYPE_LABELS[event.type] ?? event.type;
  const summary = summarizePayload(event.payload as Record<string, unknown>);

  return (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-lg border transition-colors',
        colors.border,
        colors.bg,
        isLatest && 'ring-1 ring-ring/20'
      )}
    >
      {/* Icon */}
      <div
        className={cn('mt-0.5 shrink-0', colors.text)}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-semibold uppercase tracking-wide', colors.text)}>
            {label}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatTime(event.createdAt)}
          </span>
        </div>
        {summary && (
          <pre className="mt-1.5 text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono leading-relaxed max-h-48 overflow-y-auto">
            {summary}
          </pre>
        )}
      </div>
    </div>
  );
}

export function ActivityTimeline({ events, missionId }: ActivityTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  if (!missionId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Activity className="h-10 w-10 mx-auto text-muted-foreground/30" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">
            No active mission — events will stream here in real time.
          </p>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Activity className="h-10 w-10 mx-auto text-muted-foreground/30" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">
            Waiting for events…
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-2 p-1">
        {events.map((event, idx) => (
          <EventItem
            key={event.id}
            event={event}
            isLatest={idx === events.length - 1}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
