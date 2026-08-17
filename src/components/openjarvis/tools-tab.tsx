'use client';

import { useEffect, useState, useCallback } from 'react';
import { getTools, updateTool, deleteTool } from '@/lib/openjarvis-api';
import type { Tool, RiskLevel } from '@/lib/openjarvis-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const RISK_CLASSES: Record<RiskLevel, string> = {
  low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  high: 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400',
  critical: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
};

export function ToolsTab() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTools();
      setTools(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tools');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const handleToggle = useCallback(
    async (name: string, enabled: boolean) => {
      try {
        const updated = await updateTool(name, { enabled });
        setTools((prev) => prev.map((t) => (t.name === name ? updated : t)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Toggle failed');
      }
    },
    []
  );

  const handleDelete = useCallback(async (name: string) => {
    try {
      await deleteTool(name);
      setTools((prev) => prev.filter((t) => t.name !== name));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading tools" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-500" role="alert">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={fetchTools}>
          Retry
        </Button>
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <p className="text-sm text-muted-foreground p-4 text-center">
        No tools registered.
      </p>
    );
  }

  return (
    <ScrollArea className="h-full max-h-96 lg:max-h-full">
      <div className="flex flex-col gap-2 p-1">
        {tools.map((tool) => (
          <div
            key={tool.name}
            className="flex items-start gap-3 p-3 rounded-lg border border-border"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{tool.name}</span>
                {tool.riskLevel && (
                  <Badge
                    variant="outline"
                    className={cn('text-[10px]', RISK_CLASSES[tool.riskLevel] ?? '')}
                  >
                    {tool.riskLevel}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {tool.description}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                checked={tool.enabled}
                onCheckedChange={(checked) => handleToggle(tool.name, checked)}
                aria-label={`Toggle ${tool.name}`}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleDelete(tool.name)}
                aria-label={`Delete tool ${tool.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
