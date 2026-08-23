'use client';

import { useEffect, useState, useCallback } from 'react';
import { getVaultEntries, storeVaultEntry, getVaultEntry, deleteVaultEntry } from '@/lib/openjarvis-api';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, Eye, EyeOff, Key } from 'lucide-react';

interface VaultItem {
  id: string;
  key: string;
  createdAt: string;
  updatedAt: string;
}

export function VaultTab() {
  const [entries, setEntries] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getVaultEntries();
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch vault entries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    setAdding(true);
    try {
      await storeVaultEntry(newKey.trim(), newValue.trim());
      setEntries((prev) => [
        {
          id: crypto.randomUUID(),
          key: newKey.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      resetForm();
      setAddOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store secret');
    } finally {
      setAdding(false);
    }
  };

  const resetForm = () => {
    setNewKey('');
    setNewValue('');
  };

  const handleDelete = async (key: string) => {
    try {
      await deleteVaultEntry(key);
      setEntries((prev) => prev.filter((e) => e.key !== key));
      setRevealedKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleReveal = async (key: string) => {
    if (revealedKeys[key]) {
      setRevealedKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setRevealing(key);
    try {
      const entry = await getVaultEntry(key);
      setRevealedKeys((prev) => ({ ...prev, [key]: entry.value || '(empty)' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reveal value');
    } finally {
      setRevealing(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading vault" />
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-500" role="alert">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={fetchEntries}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between p-1">
        <span className="text-xs text-muted-foreground">{entries.length} secrets</span>
        <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> Add Secret
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Store Secret</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-xs">Key</Label>
                <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="API_KEY" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Value</Label>
                <Input
                  type="password"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="sk-xxxx..."
                  className="mt-1"
                />
              </div>
              <Button onClick={handleAdd} disabled={!newKey.trim() || !newValue.trim() || adding} className="w-full">
                {adding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Store
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && entries.length > 0 && (
        <p className="text-xs text-red-500 px-1" role="alert">{error}</p>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 text-center">No secrets stored. Add secrets to manage API keys and credentials.</p>
      ) : (
        <ScrollArea className="flex-1 max-h-96 lg:max-h-[calc(100vh-280px)]">
          <div className="flex flex-col gap-1 p-1">
            {entries.map((entry) => {
              const isRevealed = !!revealedKeys[entry.key];
              return (
                <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent/50 transition-colors">
                  <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium font-mono">{entry.key}</span>
                      {isRevealed && (
                        <span className="text-xs text-muted-foreground font-mono truncate">
                          {revealedKeys[entry.key]}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Updated {formatDate(entry.updatedAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={revealing === entry.key}
                      onClick={() => handleReveal(entry.key)}
                      aria-label={isRevealed ? 'Hide value' : 'Reveal value'}
                    >
                      {revealing === entry.key ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isRevealed ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDelete(entry.key)}
                      aria-label={`Delete secret ${entry.key}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
