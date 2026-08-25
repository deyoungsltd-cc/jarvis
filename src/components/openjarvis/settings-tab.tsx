'use client';

import { useTheme } from 'next-themes';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useSyncExternalStore } from 'react';

interface SettingsTabProps {
  provider: string;
  onProviderChange: (provider: string) => void;
}

export function SettingsTab({ provider, onProviderChange }: SettingsTabProps) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  return (
    <div className="flex flex-col gap-6 p-2">
      {/* Model Provider */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="provider-select" className="text-sm font-medium">
          Model Provider
        </Label>
        <Select value={provider} onValueChange={onProviderChange}>
          <SelectTrigger id="provider-select" className="w-full">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openrouter">OpenRouter (Uncensored)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Currently using <span className="font-mono">nousresearch/hermes-3-llama-3.1-70b:free</span>
        </p>
      </div>

      {/* Theme */}
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium">Theme</Label>
        {mounted ? (
          <div className="flex items-center gap-2">
            {([
              { value: 'light', icon: Sun, label: 'Light' },
              { value: 'dark', icon: Moon, label: 'Dark' },
              { value: 'system', icon: Monitor, label: 'System' },
            ] as const).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  theme === value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
