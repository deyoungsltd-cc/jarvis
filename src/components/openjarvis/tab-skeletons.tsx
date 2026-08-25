'use client';

import { Skeleton } from '@/components/ui/skeleton';

export function MissionsSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
          <Skeleton className="h-5 w-5 rounded-full mt-0.5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ActivitySkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-2">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1 rounded-md" />
          <Skeleton className="h-10 flex-1 rounded-md" />
          <Skeleton className="h-10 flex-1 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function ToolsSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MemorySkeleton() {
  return (
    <div className="flex flex-col gap-3 p-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="p-3 rounded-lg border space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function ApprovalsSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="p-4 rounded-lg border space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-3 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
