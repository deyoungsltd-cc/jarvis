'use client';

import { useEffect, useState, useCallback } from 'react';
import { getDevices } from '@/lib/openjarvis-api';
import type { Device } from '@/lib/openjarvis-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Monitor, Wifi, WifiOff } from 'lucide-react';

const STATUS_DOT: Record<string, string> = {
  online: 'bg-emerald-500',
  idle: 'bg-amber-500',
  busy: 'bg-orange-500',
  offline: 'bg-red-500',
};

export function DaemonStatus() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [open, setOpen] = useState(false);

  const loadDevices = useCallback(async () => {
    try {
      const data = await getDevices();
      setDevices(data);
    } catch {}
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching + polling pattern
    loadDevices();
    const interval = setInterval(loadDevices, 15000);
    return () => clearInterval(interval);
  }, [loadDevices]);

  const onlineCount = devices.filter((d) => d.status === 'online' || d.status === 'idle' || d.status === 'busy').length;
  const hasOnline = onlineCount > 0;
  const totalDevices = devices.length;

  // Show 0/0 while first load happens (no loading state needed for a small status indicator)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5"
        >
          {hasOnline ? (
            <Wifi className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-red-500" />
          )}
          <span className={cn(hasOnline ? 'text-emerald-500' : 'text-red-500')}>
            {onlineCount}<span className="text-muted-foreground">/{totalDevices}</span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-0">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-sm font-medium">Daemons</span>
          <Badge variant="outline" className="text-[10px]">{onlineCount} online</Badge>
        </div>
        <ScrollArea className="max-h-[240px]">
          {devices.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4 text-center">No devices registered.</p>
          ) : (
            <div className="p-1">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent/50"
                >
                  <div className={cn('h-2 w-2 rounded-full shrink-0', STATUS_DOT[device.status] || 'bg-zinc-400')} />
                  <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{device.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{device.hostname}{device.os ? ` · ${device.os}` : ''}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground capitalize">{device.status}</span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
