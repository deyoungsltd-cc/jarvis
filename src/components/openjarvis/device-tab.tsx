'use client';

import { useEffect, useState, useCallback } from 'react';
import { getDevices, registerDevice, deleteDevice, sendDaemonCommand, getTools } from '@/lib/openjarvis-api';
import type { Device, Tool } from '@/lib/openjarvis-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, Plus, Trash2, Send, Monitor, ChevronRight, Server } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_DOT: Record<string, string> = {
  online: 'bg-emerald-500',
  idle: 'bg-amber-500',
  busy: 'bg-orange-500',
  offline: 'bg-red-500',
};

export function DeviceTab() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedCommand, setSelectedCommand] = useState('');
  const [commandParams, setCommandParams] = useState('{}');
  const [sending, setSending] = useState(false);
  const [commandResult, setCommandResult] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);

  // Register form
  const [regName, setRegName] = useState('');
  const [regHost, setRegHost] = useState('');
  const [regOs, setRegOs] = useState('');
  const [regArch, setRegArch] = useState('');
  const [registering, setRegistering] = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDevices();
      setDevices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    getTools().then(setTools).catch(() => {});
  }, []);

  const handleRegister = async () => {
    if (!regName.trim() || !regHost.trim()) return;
    setRegistering(true);
    try {
      const device = await registerDevice({
        name: regName.trim(),
        hostname: regHost.trim(),
        os: regOs.trim() || undefined,
        arch: regArch.trim() || undefined,
      });
      setDevices((prev) => [device, ...prev]);
      resetRegisterForm();
      setRegisterOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  const resetRegisterForm = () => {
    setRegName('');
    setRegHost('');
    setRegOs('');
    setRegArch('');
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDevice(id);
      setDevices((prev) => prev.filter((d) => d.id !== id));
      if (selectedDevice?.id === id) setSelectedDevice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleSendCommand = async () => {
    if (!selectedDevice || !selectedCommand) return;
    setSending(true);
    setCommandResult(null);
    setCommandError(null);
    try {
      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(commandParams);
      } catch {
        setCommandError('Invalid JSON params');
        setSending(false);
        return;
      }
      const result = await sendDaemonCommand(selectedDevice.id, selectedCommand, params);
      setCommandResult(JSON.stringify(result, null, 2));
    } catch (err) {
      setCommandError(err instanceof Error ? err.message : 'Command failed');
    } finally {
      setSending(false);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading devices" />
      </div>
    );
  }

  if (error && devices.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-500" role="alert">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={fetchDevices}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between p-1">
        <span className="text-xs text-muted-foreground">{devices.length} devices</span>
        <Dialog open={registerOpen} onOpenChange={(v) => { setRegisterOpen(v); if (!v) resetRegisterForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> Register Device
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register Device</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div><Label className="text-xs">Name</Label><Input value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Living Room PC" className="mt-1" /></div>
              <div><Label className="text-xs">Hostname</Label><Input value={regHost} onChange={(e) => setRegHost(e.target.value)} placeholder="living-room.local" className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">OS</Label><Input value={regOs} onChange={(e) => setRegOs(e.target.value)} placeholder="Ubuntu 24.04" className="mt-1" /></div>
                <div><Label className="text-xs">Architecture</Label><Input value={regArch} onChange={(e) => setRegArch(e.target.value)} placeholder="x86_64" className="mt-1" /></div>
              </div>
              <Button onClick={handleRegister} disabled={!regName.trim() || !regHost.trim() || registering} className="w-full">
                {registering ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Register
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && devices.length > 0 && (
        <p className="text-xs text-red-500 px-1" role="alert">{error}</p>
      )}

      {devices.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 text-center">No devices registered. Register a daemon to get started.</p>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Device List */}
          <ScrollArea className="flex-1 max-h-96 lg:max-h-[calc(100vh-280px)]">
            <div className="flex flex-col gap-2 p-1">
              {devices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => { setSelectedDevice(device); setCommandResult(null); setCommandError(null); }}
                  className={cn(
                    'flex items-center gap-3 w-full text-left p-3 rounded-lg border border-border transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selectedDevice?.id === device.id && 'bg-accent border-primary/30'
                  )}
                >
                  <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', STATUS_DOT[device.status] || 'bg-zinc-400')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">{device.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{device.hostname}{device.os ? ` · ${device.os}` : ''}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </ScrollArea>

          {/* Device Detail Panel */}
          {selectedDevice && (
            <div className="w-[320px] shrink-0 border border-border rounded-lg p-4 flex flex-col gap-4 max-h-96 lg:max-h-[calc(100vh-280px)] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  <span className="font-medium text-sm">{selectedDevice.name}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(selectedDevice.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Status</span><p className="font-medium capitalize flex items-center gap-1 mt-0.5"><span className={cn('h-2 w-2 rounded-full', STATUS_DOT[selectedDevice.status])} />{selectedDevice.status}</p></div>
                <div><span className="text-muted-foreground">Hostname</span><p className="font-medium mt-0.5">{selectedDevice.hostname}</p></div>
                <div><span className="text-muted-foreground">OS</span><p className="font-medium mt-0.5">{selectedDevice.os || '—'}</p></div>
                <div><span className="text-muted-foreground">Arch</span><p className="font-medium mt-0.5">{selectedDevice.arch || '—'}</p></div>
                <div><span className="text-muted-foreground">IP</span><p className="font-medium mt-0.5 font-mono">{selectedDevice.ipAddress || '—'}</p></div>
                <div><span className="text-muted-foreground">Daemon</span><p className="font-medium mt-0.5">{selectedDevice.daemonVersion || '—'}</p></div>
                <div className="col-span-2"><span className="text-muted-foreground">Last Seen</span><p className="font-medium mt-0.5">{formatDate(selectedDevice.lastSeenAt)}</p></div>
                {selectedDevice.capabilities && (
                  <div className="col-span-2"><span className="text-muted-foreground">Capabilities</span><p className="font-medium mt-0.5">{selectedDevice.capabilities}</p></div>
                )}
              </div>

              <Separator />

              {/* Send Command */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Send Command</Label>
                <Select value={selectedCommand} onValueChange={setSelectedCommand}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select command" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ping" className="text-xs">ping</SelectItem>
                    <SelectItem value="system_info" className="text-xs">system_info</SelectItem>
                    <SelectItem value="shell_exec" className="text-xs">shell_exec</SelectItem>
                    {tools.filter((t) => t.enabled).map((t) => (
                      <SelectItem key={t.name} value={t.name} className="text-xs">{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={commandParams}
                  onChange={(e) => setCommandParams(e.target.value)}
                  placeholder='{"key": "value"}'
                  className="text-xs font-mono min-h-[60px]"
                  rows={3}
                />
                <Button
                  onClick={handleSendCommand}
                  disabled={!selectedCommand || sending}
                  size="sm"
                  className="w-full text-xs gap-1"
                >
                  {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Send Command
                </Button>
                {commandResult && (
                  <pre className="text-[11px] bg-muted p-2 rounded-md overflow-auto max-h-[100px] font-mono">
                    {commandResult}
                  </pre>
                )}
                {commandError && (
                  <p className="text-xs text-red-500">{commandError}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
