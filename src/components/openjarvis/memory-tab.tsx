'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getMemory,
  searchMemory,
  createMemory,
  deleteMemory,
  consolidateMemory,
  purgeExpiredMemory,
  getMemoryStats,
} from '@/lib/openjarvis-api';
import type { MemoryEntry, MemoryScope, MemoryStats } from '@/lib/openjarvis-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Trash2, Search, Plus, X, BarChart3, RefreshCw, ShieldAlert, Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SCOPES: MemoryScope[] = ['working', 'episodic', 'semantic', 'preference', 'project'];

const SCOPE_STYLES: Record<MemoryScope, string> = {
  working:   'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  episodic:  'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  semantic:  'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  preference:'border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400',
  project:   'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

const SCOPE_LABELS: Record<MemoryScope, string> = {
  working: 'Working',
  episodic: 'Episodic',
  semantic: 'Semantic',
  preference: 'Preference',
  project: 'Project',
};

function importanceStars(n: number) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '(empty)';
  if (typeof val === 'string') return val.length > 150 ? val.slice(0, 150) + '…' : val;
  try {
    const s = JSON.stringify(val);
    return s.length > 150 ? s.slice(0, 150) + '…' : s;
  } catch {
    return String(val);
  }
}

export function MemoryTab() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');;
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [consolidating, setConsolidating] = useState(false);

  // Create form state
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newScope, setNewScope] = useState<MemoryScope>('semantic');
  const [newTags, setNewTags] = useState('');
  const [newImportance, setNewImportance] = useState(3);
  const [creating, setCreating] = useState(false);

  const fetchMemory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMemory(
        scopeFilter !== 'all' ? scopeFilter : undefined
      );
      // API should return an array, but guard against wrapped responses
      const entries = Array.isArray(data) ? data : (data as Record<string, unknown>).data;
      setEntries(Array.isArray(entries) ? entries : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch memory');
    } finally {
      setLoading(false);
    }
  }, [scopeFilter]);

  useEffect(() => {
    fetchMemory();
  }, [fetchMemory]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      fetchMemory();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const results = await searchMemory(searchQuery, {
        scope: scopeFilter !== 'all' ? scopeFilter : undefined,
      });
      // Map search results to MemoryEntry-like objects for display
      setEntries(results.map(r => ({
        id: r.id,
        scope: r.scope as MemoryScope,
        key: r.key,
        value: r.value,
        tags: r.tags,
        source: r.source as any,
        importance: r.importance,
        accessCount: 0,
        createdAt: r.createdAt,
        updatedAt: r.createdAt,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, scopeFilter, fetchMemory]);

  const handleCreate = useCallback(async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    setCreating(true);
    try {
      let parsedValue: unknown = newValue;
      try { parsedValue = JSON.parse(newValue); } catch { /* keep as string */ }
      const tags = newTags.split(',').map(t => t.trim()).filter(Boolean);
      await createMemory({
        scope: newScope,
        key: newKey,
        value: parsedValue,
        tags: tags.length > 0 ? tags : undefined,
        importance: newImportance,
        source: 'user',
      });
      setShowCreate(false);
      setNewKey('');
      setNewValue('');
      setNewTags('');
      setNewImportance(3);
      fetchMemory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }, [newKey, newValue, newScope, newTags, newImportance, fetchMemory]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteMemory(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, []);

  const handleConsolidate = useCallback(async () => {
    setConsolidating(true);
    try {
      const result = await consolidateMemory();
      if (result.merged > 0) fetchMemory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Consolidation failed');
    } finally {
      setConsolidating(false);
    }
  }, [fetchMemory]);

  const handlePurge = useCallback(async () => {
    try {
      await purgeExpiredMemory();
      fetchMemory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purge failed');
    }
  }, [fetchMemory]);

  const handleShowStats = useCallback(async () => {
    if (showStats) { setShowStats(false); return; }
    try {
      const s = await getMemoryStats();
      setStats(s);
      setShowStats(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stats failed');
    }
  }, [showStats]);

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading memory" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="flex items-center gap-1 flex-1 min-w-[180px]">
          <Input
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="h-8 text-sm"
            aria-label="Search memories"
          />
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleSearch} aria-label="Search">
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Scope filter */}
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Filter by scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            {SCOPES.map(s => (
              <SelectItem key={s} value={s}>{SCOPE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Actions */}
        <Button variant="outline" size="sm" className="h-8" onClick={() => setShowCreate(!showCreate)} aria-label="Add memory">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={handleShowStats} aria-label="Toggle stats">
          <BarChart3 className="h-3.5 w-3.5 mr-1" /> Stats
        </Button>
        <Button
          variant="outline" size="sm" className="h-8"
          onClick={handleConsolidate}
          disabled={consolidating}
          aria-label="Consolidate duplicates"
        >
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1', consolidating && 'animate-spin')} /> Merge
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={handlePurge} aria-label="Purge expired">
          <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Purge
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
          <div className="flex gap-2">
            <Input placeholder="Key" value={newKey} onChange={(e) => setNewKey(e.target.value)} className="h-8 text-sm flex-1" />
            <Select value={newScope} onValueChange={(v) => setNewScope(v as MemoryScope)}>
              <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCOPES.map(s => <SelectItem key={s} value={s}>{SCOPE_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Input placeholder="Value (JSON or plain text)" value={newValue} onChange={(e) => setNewValue(e.target.value)} className="h-8 text-sm" />
          <div className="flex gap-2">
            <Input placeholder="Tags (comma-separated)" value={newTags} onChange={(e) => setNewTags(e.target.value)} className="h-8 text-sm flex-1" />
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>★</span>
              <Select value={String(newImportance)} onValueChange={(v) => setNewImportance(Number(v))}>
                <SelectTrigger className="h-8 w-[56px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleCreate} disabled={creating || !newKey.trim()}>
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Stats Panel */}
      {showStats && stats && (
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-xs space-y-1">
          <div className="flex items-center gap-1 font-medium mb-2">
            <Database className="h-3.5 w-3.5" /> Memory Statistics
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">Total entries:</span><span>{stats.totalEntries}</span>
            <span className="text-muted-foreground">Expired:</span><span>{stats.expiredCount}</span>
            <span className="text-muted-foreground">Avg accesses:</span><span>{stats.averageAccessCount}</span>
          </div>
          <div className="mt-1">
            <span className="text-muted-foreground">By scope: </span>
            {Object.entries(stats.byScope).map(([s, c]) => (
              <Badge key={s} variant="outline" className="ml-1 text-[10px] h-5">{s}: {c}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-red-500" role="alert">{error}</p>
          <Button variant="outline" size="sm" className="h-7" onClick={() => { setError(null); fetchMemory(); }}>Retry</Button>
        </div>
      )}

      {/* Memory List */}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 text-center">No memory entries.</p>
      ) : (
        <ScrollArea className="h-full max-h-96 lg:max-h-full">
          <div className="flex flex-col gap-2 p-1">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-border group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium font-mono">{entry.key}</span>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px]', SCOPE_STYLES[entry.scope] ?? '')}
                    >
                      {entry.scope}
                    </Badge>
                    {Array.isArray(entry.tags) && entry.tags.length > 0 && entry.tags.map(t => (
                      <Badge key={t} variant="secondary" className="text-[10px] h-5">{t}</Badge>
                    ))}
                    <span className="text-[10px] text-muted-foreground ml-auto" title={`Importance: ${entry.importance}/5`}>
                      <span className="text-amber-500">{importanceStars(entry.importance)}</span>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono break-all whitespace-pre-wrap">
                    {formatValue(entry.value)}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span>src: {entry.source}</span>
                    {entry.accessCount > 0 && <span>accessed: {entry.accessCount}x</span>}
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDelete(entry.id)}
                  aria-label={`Delete memory ${entry.key}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
