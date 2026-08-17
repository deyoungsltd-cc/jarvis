'use client';

import { useEffect, useState, useCallback } from 'react';
import { getMemory, deleteMemory } from '@/lib/openjarvis-api';
import type { MemoryEntry, MemoryScope } from '@/lib/openjarvis-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SCOPE_CLASSES: Record<MemoryScope, string> = {
  global: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  mission: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  session: 'border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-400',
};

export function MemoryTab() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMemory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMemory();
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch memory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemory();
  }, [fetchMemory]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteMemory(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, []);

  const formatValue = (val: unknown): string => {
    if (typeof val === 'string') return val.length > 120 ? val.slice(0, 120) + '…' : val;
    try {
      const s = JSON.stringify(val);
      return s.length > 120 ? s.slice(0, 120) + '…' : s;
    } catch {
      return String(val);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading memory" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-500" role="alert">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={fetchMemory}>
          Retry
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground p-4 text-center">
        No memory entries.
      </p>
    );
  }

  return (
    <ScrollArea className="h-full max-h-96 lg:max-h-full">
      <div className="flex flex-col gap-2 p-1">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-start gap-3 p-3 rounded-lg border border-border"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium font-mono">{entry.key}</span>
                <Badge
                  variant="outline"
                  className={cn('text-[10px]', SCOPE_CLASSES[entry.scope] ?? '')}
                >
                  {entry.scope}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-mono break-all whitespace-pre-wrap">
                {formatValue(entry.value)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => handleDelete(entry.id)}
              aria-label={`Delete memory ${entry.key}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
