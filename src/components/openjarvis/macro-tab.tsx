'use client';

import { useEffect, useState, useCallback } from 'react';
import { getMacros, createMacro, updateMacro, deleteMacro, runMacro } from '@/lib/openjarvis-api';
import type { Macro, MacroStep } from '@/lib/openjarvis-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, Play, GripVertical, Clock } from 'lucide-react';

interface StepForm {
  toolName: string;
  params: string;
  label: string;
}

function emptyStep(): StepForm {
  return { toolName: '', params: '{}', label: '' };
}

export function MacroTab() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTrigger, setNewTrigger] = useState('');
  const [steps, setSteps] = useState<StepForm[]>([emptyStep()]);
  const [creating, setCreating] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const fetchMacros = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMacros();
      setMacros(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch macros');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMacros();
  }, [fetchMacros]);

  const handleCreate = async () => {
    if (!newName.trim() || steps.length === 0) return;
    setCreating(true);
    try {
      const macroSteps: MacroStep[] = steps
        .filter((s) => s.toolName.trim())
        .map((s) => ({
          toolName: s.toolName.trim(),
          params: JSON.parse(s.params || '{}'),
          label: s.label.trim() || undefined,
        }));
      const macro = await createMacro({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        trigger: newTrigger.trim() || undefined,
        steps: macroSteps,
      });
      setMacros((prev) => [macro, ...prev]);
      resetForm();
      setCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create macro');
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewDesc('');
    setNewTrigger('');
    setSteps([emptyStep()]);
  };

  const handleToggle = async (macro: Macro, enabled: boolean) => {
    try {
      const updated = await updateMacro(macro.id, { enabled });
      setMacros((prev) => prev.map((m) => (m.id === macro.id ? updated : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMacro(id);
      setMacros((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      const updated = await runMacro(id);
      setMacros((prev) => prev.map((m) => (m.id === id ? updated : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setRunningId(null);
    }
  };

  const updateStep = (index: number, field: keyof StepForm, value: string) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const addStep = () => setSteps((prev) => [...prev, emptyStep()]);
  const removeStep = (index: number) => setSteps((prev) => prev.filter((_, i) => i !== index));

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
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading macros" />
      </div>
    );
  }

  if (error && macros.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-500" role="alert">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={fetchMacros}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between p-1">
        <span className="text-xs text-muted-foreground">{macros.length} macros</span>
        <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> New Macro
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Macro</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Macro" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Optional" className="mt-1" rows={2} />
              </div>
              <div>
                <Label className="text-xs">Trigger (Cron Expression)</Label>
                <Input value={newTrigger} onChange={(e) => setNewTrigger(e.target.value)} placeholder="0 */5 * * * (optional)" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs font-medium">Steps</Label>
                <div className="space-y-2 mt-2">
                  {steps.map((step, i) => (
                    <div key={i} className="flex gap-2 items-start p-2 rounded-lg border border-border bg-muted/30">
                      <GripVertical className="h-4 w-4 mt-2 text-muted-foreground shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={step.toolName}
                            onChange={(e) => updateStep(i, 'toolName', e.target.value)}
                            placeholder="Tool name"
                            className="h-7 text-xs"
                          />
                          <Input
                            value={step.label}
                            onChange={(e) => updateStep(i, 'label', e.target.value)}
                            placeholder="Label (optional)"
                            className="h-7 text-xs"
                          />
                        </div>
                        <Input
                          value={step.params}
                          onChange={(e) => updateStep(i, 'params', e.target.value)}
                          placeholder='{"key": "value"}'
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => removeStep(i)}
                        disabled={steps.length <= 1}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={addStep}>
                  <Plus className="h-3 w-3 mr-1" /> Add Step
                </Button>
              </div>
              <Button onClick={handleCreate} disabled={!newName.trim() || creating} className="w-full">
                {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Create Macro
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && macros.length > 0 && (
        <p className="text-xs text-red-500 px-1" role="alert">{error}</p>
      )}

      {macros.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 text-center">No macros yet. Create one to automate tasks.</p>
      ) : (
        <ScrollArea className="flex-1 max-h-96 lg:max-h-[calc(100vh-280px)]">
          <div className="flex flex-col gap-2 p-1">
            {macros.map((macro) => (
              <div key={macro.id} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{macro.name}</span>
                    <Badge variant={macro.enabled ? 'default' : 'outline'} className="text-[10px]">
                      {macro.enabled ? 'enabled' : 'disabled'}
                    </Badge>
                    {macro.trigger && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        <Clock className="h-2.5 w-2.5 mr-0.5" />{macro.trigger}
                      </Badge>
                    )}
                  </div>
                  {macro.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{macro.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                    <span>{macro.steps.length} steps</span>
                    <span>Run {macro.runCount}x</span>
                    <span>Last: {formatDate(macro.lastRunAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={runningId === macro.id}
                    onClick={() => handleRun(macro.id)}
                  >
                    {runningId === macro.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    Run
                  </Button>
                  <Switch
                    checked={macro.enabled}
                    onCheckedChange={(checked) => handleToggle(macro, checked)}
                    aria-label={`Toggle ${macro.name}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleDelete(macro.id)}
                    aria-label={`Delete macro ${macro.name}`}
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
