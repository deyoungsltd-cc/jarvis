'use client';

import { useState, useCallback, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';
import { createMission, runAgent } from '@/lib/openjarvis-api';
import type { Mission } from '@/lib/openjarvis-types';

interface GoalInputProps {
  onMissionCreated: (mission: Mission) => void;
  disabled?: boolean;
  provider?: string;
}

export function GoalInput({ onMissionCreated, disabled, provider }: GoalInputProps) {
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = goal.trim();
    if (!trimmed || submitting || disabled) return;

    setSubmitting(true);
    setError(null);

    try {
      const mission = await createMission({ goal: trimmed, provider });
      onMissionCreated(mission);
      setGoal('');
      // Start the agent on the new mission
      await runAgent({ missionId: mission.id, provider });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create mission');
    } finally {
      setSubmitting(false);
    }
  }, [goal, submitting, disabled, provider, onMissionCreated]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="goal-input" className="text-sm font-medium text-foreground">
        Goal
      </label>
      <div className="relative">
        <Textarea
          id="goal-input"
          placeholder="Describe what the agent should accomplish..."
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting || disabled}
          rows={4}
          className="pr-12 resize-none"
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={!goal.trim() || submitting || disabled}
          className="absolute bottom-2 right-2 h-8 w-8"
          aria-label="Submit goal"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2">
        {error && (
          <p className="text-xs text-red-500" role="alert">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground ml-auto">
          Enter to submit, Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
