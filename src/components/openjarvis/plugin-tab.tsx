'use client';

import { useEffect, useState, useCallback } from 'react';
import { getPlugins, createPlugin, togglePlugin, deletePlugin } from '@/lib/openjarvis-api';
import type { Plugin } from '@/lib/openjarvis-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, Puzzle } from 'lucide-react';

export function PluginTab() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPlugins();
      setPlugins(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch plugins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const plugin = await createPlugin({
        name: newName.trim(),
        version: newVersion.trim() || undefined,
        description: newDesc.trim() || undefined,
      });
      setPlugins((prev) => [plugin, ...prev]);
      resetForm();
      setCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create plugin');
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewVersion('');
    setNewDesc('');
  };

  const handleToggle = async (plugin: Plugin, enabled: boolean) => {
    try {
      const updated = await togglePlugin(plugin.id, enabled);
      setPlugins((prev) => prev.map((p) => (p.id === plugin.id ? updated : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePlugin(id);
      setPlugins((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading plugins" />
      </div>
    );
  }

  if (error && plugins.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-500" role="alert">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={fetchPlugins}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between p-1">
        <span className="text-xs text-muted-foreground">{plugins.length} plugins</span>
        <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> Register Plugin
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register Plugin</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="my-plugin" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Version</Label>
                <Input value={newVersion} onChange={(e) => setNewVersion(e.target.value)} placeholder="1.0.0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What this plugin does" className="mt-1" rows={2} />
              </div>
              <Button onClick={handleCreate} disabled={!newName.trim() || creating} className="w-full">
                {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Register
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && plugins.length > 0 && (
        <p className="text-xs text-red-500 px-1" role="alert">{error}</p>
      )}

      {plugins.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 text-center">No plugins registered. Register a plugin to extend functionality.</p>
      ) : (
        <ScrollArea className="flex-1 max-h-96 lg:max-h-[calc(100vh-280px)]">
          <div className="flex flex-col gap-2 p-1">
            {plugins.map((plugin) => (
              <div key={plugin.id} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                <Puzzle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{plugin.name}</span>
                    {plugin.version && (
                      <Badge variant="outline" className="text-[10px] font-mono">v{plugin.version}</Badge>
                    )}
                    <Badge variant={plugin.enabled ? 'default' : 'outline'} className="text-[10px]">
                      {plugin.enabled ? 'enabled' : 'disabled'}
                    </Badge>
                  </div>
                  {plugin.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{plugin.description}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">Added {formatDate(plugin.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch
                    checked={plugin.enabled}
                    onCheckedChange={(checked) => handleToggle(plugin, checked)}
                    aria-label={`Toggle ${plugin.name}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleDelete(plugin.id)}
                    aria-label={`Delete plugin ${plugin.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
