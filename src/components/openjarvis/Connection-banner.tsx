'use client';

import { cn } from '@/lib/utils';
import { WifiOff, AlertTriangle, Unplug } from 'lucide-react';

interface ConnectionBannerProps {
  backendError: string | null;
  wsConnected: boolean;
}

export function ConnectionBanner({ backendError, wsConnected }: ConnectionBannerProps) {
  if (!backendError && wsConnected) return null;

  return (
    <div className="flex flex-col gap-1 px-4 py-2 bg-red-500/10 border-b border-red-500/20">
      {backendError && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="font-medium">Backend unavailable</span>
          <span className="text-xs opacity-80">{backendError}</span>
        </div>
      )}
      {!wsConnected && !backendError && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400" role="status">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Live updates disconnected — reconnecting…</span>
        </div>
      )}
    </div>
  );
}
