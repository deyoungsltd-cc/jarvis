'use client';

import { useEffect, useState, useCallback } from 'react';
import { getWebhooks, createWebhook, updateWebhook, deleteWebhook } from '@/lib/openjarvis-api';
import type { Webhook } from '@/lib/openjarvis-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, Webhook, AlertTriangle } from 'lucide-react';

const AVAILABLE_EVENTS = [
  'mission:created',
  'mission:updated',
  'mission:completed',
  'mission:failed',
  'approval:pending',
  'approval:resolved',
  'device:online',
  'device:offline',
];

export function WebhookTab() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWebhooks();
      setWebhooks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch webhooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const handleCreate = async () => {
    if (!newUrl.trim() || selectedEvents.length === 0) return;
    setCreating(true);
    try {
      const webhook = await createWebhook({
        url: newUrl.trim(),
        events: selectedEvents,
        secret: newSecret.trim() || undefined,
      });
      setWebhooks((prev) => [webhook, ...prev]);
      resetForm();
      setCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create webhook');
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setNewUrl('');
    setNewSecret('');
    setSelectedEvents([]);
  };

  const handleToggle = async (webhook: Webhook, enabled: boolean) => {
    try {
      const updated = await updateWebhook(webhook.id, { enabled });
      setWebhooks((prev) => prev.map((w) => (w.id === webhook.id ? updated : w)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWebhook(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  const parseEvents = (eventsStr: string): string[] => {
    try {
      return JSON.parse(eventsStr);
    } catch {
      return eventsStr.split(',').map((s) => s.trim());
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading webhooks" />
      </div>
    );
  }

  if (error && webhooks.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-500" role="alert">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={fetchWebhooks}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between p-1">
        <span className="text-xs text-muted-foreground">{webhooks.length} webhooks</span>
        <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> New Webhook
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Webhook</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-xs">URL</Label>
                <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://example.com/webhook" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Events</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {AVAILABLE_EVENTS.map((event) => (
                    <label key={event} className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        checked={selectedEvents.includes(event)}
                        onCheckedChange={() => toggleEvent(event)}
                      />
                      <span className="text-xs">{event}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Secret (optional)</Label>
                <Input
                  type="password"
                  value={newSecret}
                  onChange={(e) => setNewSecret(e.target.value)}
                  placeholder="Webhook signing secret"
                  className="mt-1"
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={!newUrl.trim() || selectedEvents.length === 0 || creating}
                className="w-full"
              >
                {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Create Webhook
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && webhooks.length > 0 && (
        <p className="text-xs text-red-500 px-1" role="alert">{error}</p>
      )}

      {webhooks.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 text-center">No webhooks configured. Create one to receive event notifications.</p>
      ) : (
        <ScrollArea className="flex-1 max-h-96 lg:max-h-[calc(100vh-280px)]">
          <div className="flex flex-col gap-2 p-1">
            {webhooks.map((wh) => {
              const events = parseEvents(wh.events);
              return (
                <div key={wh.id} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                  <Webhook className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono truncate max-w-[280px]">{wh.url}</span>
                      <Badge variant={wh.enabled ? 'default' : 'outline'} className="text-[10px]">
                        {wh.enabled ? 'active' : 'disabled'}
                      </Badge>
                      {wh.failCount > 0 && (
                        <Badge variant="destructive" className="text-[10px] gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" />{wh.failCount} fails
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {events.map((ev) => (
                        <Badge key={ev} variant="outline" className="text-[10px]">{ev}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                      <span>Last triggered: {formatDate(wh.lastTriggerAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Switch
                      checked={wh.enabled}
                      onCheckedChange={(checked) => handleToggle(wh, checked)}
                      aria-label={`Toggle webhook`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDelete(wh.id)}
                      aria-label="Delete webhook"
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
