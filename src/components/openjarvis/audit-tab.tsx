'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAuditLogs } from '@/lib/openjarvis-api';
import type { AuditLog } from '@/lib/openjarvis-types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Filter, CalendarDays } from 'lucide-react';

const ACTION_OPTIONS = [
  'mission:create',
  'mission:update',
  'mission:delete',
  'tool:execute',
  'approval:approve',
  'approval:reject',
  'device:register',
  'vault:store',
  'vault:delete',
  'webhook:create',
];

export function AuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, string> = {
        limit: String(limit),
        offset: String(offset),
      };
      if (actionFilter !== 'all') filters.action = actionFilter;
      if (fromDate) filters.from = new Date(fromDate).toISOString();
      if (toDate) filters.to = new Date(toDate).toISOString();
      const data = await getAuditLogs(filters as Parameters<typeof getAuditLogs>[0]);
      setLogs(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, fromDate, toDate, offset]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleResetFilters = () => {
    setActionFilter('all');
    setFromDate('');
    setToDate('');
    setOffset(0);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const getActorName = (log: AuditLog) => {
    if (log.user?.name) return log.user.name;
    if (log.user?.email) return log.user.email;
    if (log.device?.name) return log.device.name;
    return log.userId || log.deviceId || 'System';
  };

  if (loading && offset === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading audit logs" />
      </div>
    );
  }

  if (error && offset === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-500" role="alert">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={fetchLogs}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 p-1">
        <div className="flex flex-col gap-1">
          <Label className="text-xs flex items-center gap-1">
            <Filter className="h-3 w-3" /> Action
          </Label>
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setOffset(0); }}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All actions</SelectItem>
              {ACTION_OPTIONS.map((a) => (
                <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs flex items-center gap-1">
            <CalendarDays className="h-3 w-3" /> From
          </Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setOffset(0); }}
            className="w-[140px] h-8 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setOffset(0); }}
            className="w-[140px] h-8 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleResetFilters}>
          Reset
        </Button>
        <span className="text-xs text-muted-foreground ml-auto self-center">
          {total} total entries
        </span>
      </div>

      {/* Table */}
      <ScrollArea className="flex-1 max-h-96 lg:max-h-[calc(100vh-280px)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-[150px]">Timestamp</TableHead>
              <TableHead className="text-xs w-[120px]">Actor</TableHead>
              <TableHead className="text-xs w-[130px]">Action</TableHead>
              <TableHead className="text-xs">Resource</TableHead>
              <TableHead className="text-xs w-[120px]">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  No audit logs found.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs font-mono py-2">
                    {formatDate(log.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs py-2">{getActorName(log)}</TableCell>
                  <TableCell className="text-xs py-2">
                    <Badge variant="outline" className="text-[10px]">{log.action}</Badge>
                  </TableCell>
                  <TableCell className="text-xs py-2 truncate max-w-[200px]">
                    {log.resource || log.detail || '—'}
                  </TableCell>
                  <TableCell className="text-xs font-mono py-2">
                    {log.ipAddress || '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Pagination */}
      {offset + limit < total && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setOffset((prev) => prev + limit)}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
