import type { MissionStatus, AgentDisplayState } from './openjarvis-types';

export interface StatusConfig {
  state: AgentDisplayState;
  label: string;
  dotClass: string;
  iconClass: string;
}

const map: Record<MissionStatus, StatusConfig> = {
  draft: {
    state: 'idle',
    label: 'Draft',
    dotClass: 'bg-gray-400 dark:bg-gray-500',
    iconClass: 'text-gray-400 dark:text-gray-500',
  },
  queued: {
    state: 'idle',
    label: 'Queued',
    dotClass: 'bg-gray-400 dark:bg-gray-500',
    iconClass: 'text-gray-400 dark:text-gray-500',
  },
  running: {
    state: 'executing',
    label: 'Executing',
    dotClass: 'bg-amber-500',
    iconClass: 'text-amber-500',
  },
  waiting_approval: {
    state: 'waiting',
    label: 'Waiting Approval',
    dotClass: 'bg-yellow-500',
    iconClass: 'text-yellow-500',
  },
  blocked: {
    state: 'error',
    label: 'Blocked',
    dotClass: 'bg-red-500',
    iconClass: 'text-red-500',
  },
  failed: {
    state: 'error',
    label: 'Failed',
    dotClass: 'bg-red-500',
    iconClass: 'text-red-500',
  },
  completed: {
    state: 'success',
    label: 'Completed',
    dotClass: 'bg-emerald-500',
    iconClass: 'text-emerald-500',
  },
  paused: {
    state: 'paused',
    label: 'Paused',
    dotClass: 'bg-yellow-500',
    iconClass: 'text-yellow-500',
  },
  cancelled: {
    state: 'idle',
    label: 'Cancelled',
    dotClass: 'bg-gray-400 dark:bg-gray-500',
    iconClass: 'text-gray-400 dark:text-gray-500',
  },
  expired: {
    state: 'idle',
    label: 'Expired',
    dotClass: 'bg-gray-400 dark:bg-gray-500',
    iconClass: 'text-gray-400 dark:text-gray-500',
  },
};

export function getStatusConfig(status: MissionStatus): StatusConfig {
  return map[status] ?? map.draft;
}

export function getMissionStatusBadgeClasses(status: MissionStatus): string {
  const cfg = getStatusConfig(status);
  switch (cfg.state) {
    case 'executing':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'waiting':
    case 'paused':
      return 'border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400';
    case 'error':
      return 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400';
    case 'success':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    default:
      return 'border-gray-400/40 bg-gray-500/10 text-gray-600 dark:text-gray-400';
  }
}

export function getEventTypeColor(type: string): {
  border: string;
  bg: string;
  text: string;
  dot: string;
} {
  switch (type) {
    case 'interpret':
    case 'plan':
      return {
        border: 'border-sky-500/30',
        bg: 'bg-sky-500/5 dark:bg-sky-400/5',
        text: 'text-sky-600 dark:text-sky-400',
        dot: 'bg-sky-500',
      };
    case 'tool_select':
    case 'tool_execute':
      return {
        border: 'border-amber-500/30',
        bg: 'bg-amber-500/5 dark:bg-amber-400/5',
        text: 'text-amber-600 dark:text-amber-400',
        dot: 'bg-amber-500',
      };
    case 'observe':
    case 'verify':
      return {
        border: 'border-emerald-500/30',
        bg: 'bg-emerald-500/5 dark:bg-emerald-400/5',
        text: 'text-emerald-600 dark:text-emerald-400',
        dot: 'bg-emerald-500',
      };
    case 'complete':
      return {
        border: 'border-emerald-500/30',
        bg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
        text: 'text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500',
      };
    case 'error':
    case 'budget_exceeded':
      return {
        border: 'border-red-500/30',
        bg: 'bg-red-500/5 dark:bg-red-400/5',
        text: 'text-red-600 dark:text-red-400',
        dot: 'bg-red-500',
      };
    case 'memory_update':
    case 'status_change':
    default:
      return {
        border: 'border-gray-300 dark:border-gray-600',
        bg: 'bg-gray-50 dark:bg-gray-800/50',
        text: 'text-gray-500 dark:text-gray-400',
        dot: 'bg-gray-400 dark:bg-gray-500',
      };
  }
}
