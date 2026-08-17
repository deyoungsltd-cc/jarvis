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
            <SelectItem value="gemini">Gemini</SelectItem>
            <SelectItem value="groq">Groq</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Theme */}
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium">Theme</Label>
        {mounted ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme('light')}
              className={`p-2 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                theme === 'light'
                  ? 'border-foreground bg-accent'
                  : 'border-border hover:bg-accent/50'
              }`}
              aria-label="Light theme"
            >
              <Sun className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`p-2 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                theme === 'dark'
                  ? 'border-foreground bg-accent'
                  : 'border-border hover:bg-accent/50'
              }`}
              aria-label="Dark theme"
            >
              <Moon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTheme('system')}
              className={`p-2 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                theme === 'system'
                  ? 'border-foreground bg-accent'
                  : 'border-border hover:bg-accent/50'
              }`}
              aria-label="System theme"
            >
              <Monitor className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground ml-1 capitalize">
              {theme ?? 'system'}
            </span>
          </div>
        ) : (
          <div className="h-10" /> // placeholder to avoid layout shift
        )}
      </div>
    </div>
  );
}
