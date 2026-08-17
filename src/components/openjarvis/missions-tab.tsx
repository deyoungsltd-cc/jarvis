'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getMissions,
  deleteMission,
  getMissionEvents,
} from '@/lib/openjarvis-api';
import type { Mission, MissionEvent } from '@/lib/openjarvis-types';
import { getMissionStatusBadgeClasses } from '@/lib/status-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MissionsTabProps {
  onSelectMission: (mission: Mission) => void;
  activeMissionId: string | null;
}

export function MissionsTab({ onSelectMission, activeMissionId }: MissionsTabProps) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [events, setEvents] = useState<MissionEvent[]>([]);

  const fetchMissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMissions();
      setMissions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch missions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      try {
        await deleteMission(id);
        setMissions((prev) => prev.filter((m) => m.id !== id));
        if (expandedId === id) {
          setExpandedId(null);
          setEvents([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [expandedId]
  );

  const handleExpand = useCallback(async (mission: Mission) => {
    if (expandedId === mission.id) {
      setExpandedId(null);
      setEvents([]);
      return;
    }
    setExpandedId(mission.id);
    try {
      const data = await getMissionEvents(mission.id);
      setEvents(data);
    } catch {
      setEvents([]);
    }
  }, [expandedId]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading missions" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-500" role="alert">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={fetchMissions}>
          Retry
        </Button>
      </div>
    );
  }

  if (missions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground p-4 text-center">
        No missions yet. Create one from the goal input.
      </p>
    );
  }

  return (
    <ScrollArea className="h-full max-h-96 lg:max-h-full">
      <div className="flex flex-col gap-1 p-1">
        {missions.map((mission) => {
          const isExpanded = expandedId === mission.id;
          return (
            <div key={mission.id} className="flex flex-col">
              <button
                onClick={() => {
                  onSelectMission(mission);
                  handleExpand(mission);
                }}
                className={cn(
                  'flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-md transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  activeMissionId === mission.id && 'bg-accent'
                )}
                aria-expanded={isExpanded}
              >
                <ChevronRight
                  className={cn(
                    'h-4 w-4 text-muted-foreground shrink-0 transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{mission.goal}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(mission.createdAt)}</p>
                </div>
                <Badge variant="outline" className={cn('shrink-0 text-[10px]', getMissionStatusBadgeClasses(mission.status))}>
                  {mission.status}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={(e) => handleDelete(e, mission.id)}
                  aria-label={`Delete mission ${mission.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </button>
              {isExpanded && events.length > 0 && (
                <div className="ml-9 mr-2 mb-1 flex flex-col gap-1">
                  {events.slice(-20).map((ev) => (
                    <div key={ev.id} className="text-xs text-muted-foreground px-2 py-1 rounded bg-muted/50">
                      <span className="font-medium">{ev.type}</span>{' '}
                      <span className="opacity-70">
                        {new Date(ev.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
