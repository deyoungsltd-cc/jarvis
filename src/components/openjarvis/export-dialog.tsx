'use client';

import { useEffect, useState, useCallback } from 'react';
import { getMissions, exportMission } from '@/lib/openjarvis-api';
import type { Mission, ExportFormat } from '@/lib/openjarvis-types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download } from 'lucide-react';

interface ExportDialogProps {
  trigger?: React.ReactNode;
  preselectedMissionId?: string;
}

const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  json: '.json',
  markdown: '.md',
  text: '.txt',
};

export function ExportDialog({ trigger, preselectedMissionId }: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMission, setSelectedMission] = useState(preselectedMissionId || '');
  const [format, setFormat] = useState<ExportFormat>('json');
  const [includeEvents, setIncludeEvents] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchMissions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMissions();
      setMissions(data);
      if (preselectedMissionId) setSelectedMission(preselectedMissionId);
      else if (data.length > 0) setSelectedMission(data[0].id);
    } catch {}
    setLoading(false);
  }, [preselectedMissionId]);

  useEffect(() => {
    if (open) fetchMissions();
  }, [open, fetchMissions]);

  const handleExport = async () => {
    if (!selectedMission) return;
    setExporting(true);
    setError(null);
    try {
      const blob = await exportMission({
        missionId: selectedMission,
        format,
        includeEvents,
      });
      const mission = missions.find((m) => m.id === selectedMission);
      const filename = `${mission?.goal?.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_') || 'mission'}${FORMAT_EXTENSIONS[format]}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="text-xs gap-1">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Mission</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs">Mission</Label>
            <Select value={selectedMission} onValueChange={setSelectedMission} disabled={loading}>
              <SelectTrigger className="mt-1 text-xs">
                <SelectValue placeholder="Select a mission" />
              </SelectTrigger>
              <SelectContent>
                {missions.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs max-w-[300px]">
                    <span className="truncate block">{m.goal}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger className="mt-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json" className="text-xs">JSON</SelectItem>
                <SelectItem value="markdown" className="text-xs">Markdown</SelectItem>
                <SelectItem value="text" className="text-xs">Plain Text</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="include-events" checked={includeEvents} onCheckedChange={(v) => setIncludeEvents(!!v)} />
            <Label htmlFor="include-events" className="text-xs cursor-pointer">Include mission events</Label>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="text-xs">Cancel</Button>
          <Button size="sm" onClick={handleExport} disabled={!selectedMission || exporting} className="text-xs gap-1">
            {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
