'use client';

import { useEffect, useState, useCallback } from 'react';
import { getScheduledJobs, createScheduledJob, updateScheduledJob, deleteScheduledJob } from '@/lib/openjarvis-api';
import type { ScheduledJob } from '@/lib/openjarvis-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, Clock, Play } from 'lucide-react';

const PROVIDERS = ['qwen3-8b', 'qwen3-14b', 'qwen3-32b', 'qwen3-72b', 'ollama', 'custom'];

export function SchedulerTab() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCron, setNewCron] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [newProvider, setNewProvider] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getScheduledJobs();
      setJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch scheduled jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleCreate = async () => {
    if (!newName.trim() || !newCron.trim() || !newGoal.trim()) return;
    setCreating(true);
    try {
      const job = await createScheduledJob({
        name: newName.trim(),
        cronExpr: newCron.trim(),
        goal: newGoal.trim(),
        provider: newProvider.trim() || undefined,
      });
      setJobs((prev) => [job, ...prev]);
      resetForm();
      setCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewCron('');
    setNewGoal('');
    setNewProvider('');
  };

  const handleToggle = async (job: ScheduledJob, enabled: boolean) => {
    try {
      const updated = await updateScheduledJob(job.id, { enabled });
      setJobs((prev) => prev.map((j) => (j.id === job.id ? updated : j)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteScheduledJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
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
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading scheduled jobs" />
      </div>
    );
  }

  if (error && jobs.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-500" role="alert">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={fetchJobs}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between p-1">
        <span className="text-xs text-muted-foreground">{jobs.length} scheduled jobs</span>
        <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> New Job
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Scheduled Job</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Daily Backup Check" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Cron Expression</Label>
                <Input value={newCron} onChange={(e) => setNewCron(e.target.value)} placeholder="0 9 * * *" className="mt-1 font-mono" />
                <p className="text-[10px] text-muted-foreground mt-1">Standard 5-field cron: min hour day month weekday</p>
              </div>
              <div>
                <Label className="text-xs">Goal / Prompt</Label>
                <Textarea value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder="Check backup status on all devices" className="mt-1" rows={3} />
              </div>
              <div>
                <Label className="text-xs">Provider (optional)</Label>
                <Select value={newProvider} onValueChange={setNewProvider}>
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} disabled={!newName.trim() || !newCron.trim() || !newGoal.trim() || creating} className="w-full">
                {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Create Job
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && jobs.length > 0 && (
        <p className="text-xs text-red-500 px-1" role="alert">{error}</p>
      )}

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 text-center">No scheduled jobs. Create one to automate recurring missions.</p>
      ) : (
        <ScrollArea className="flex-1 max-h-96 lg:max-h-[calc(100vh-280px)]">
          <div className="flex flex-col gap-2 p-1">
            {jobs.map((job) => (
              <div key={job.id} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{job.name}</span>
                    <Badge variant={job.enabled ? 'default' : 'outline'} className="text-[10px]">
                      {job.enabled ? 'enabled' : 'disabled'}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      <Clock className="h-2.5 w-2.5 mr-0.5" />{job.cronExpr}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{job.goal}</p>
                  {job.provider && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">Provider: {job.provider}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                    <span>Run {job.runCount}x</span>
                    <span>Next: {formatDate(job.nextRunAt)}</span>
                    <span>Last: {formatDate(job.lastRunAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch
                    checked={job.enabled}
                    onCheckedChange={(checked) => handleToggle(job, checked)}
                    aria-label={`Toggle ${job.name}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleDelete(job.id)}
                    aria-label={`Delete job ${job.name}`}
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
