'use client';

import { useTheme } from 'next-themes';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Moon, Sun, Monitor, Key, Bot, Image, Video, Mic, ExternalLink, AlertTriangle } from 'lucide-react';
import { useSyncExternalStore } from 'react';

interface SettingsTabProps {
  provider: string;
  onProviderChange: (provider: string) => void;
}

const API_KEYS = [
  {
    key: 'OPENROUTER_API_KEY',
    label: 'OpenRouter API Key',
    description: 'Uncensored AI chat + image generation (Flux, SDXL)',
    icon: Bot,
    color: 'text-emerald-500',
    url: 'https://openrouter.ai/keys',
    required: true,
  },
  {
    key: 'MINIMAX_API_KEY',
    label: 'MiniMax API Key',
    description: 'Video generation (Hailuo) + Chinese TTS',
    icon: Video,
    color: 'text-violet-500',
    url: 'https://www.minimaxi.com/en',
    required: false,
  },
  {
    key: 'ELEVENLABS_API_KEY',
    label: 'ElevenLabs API Key',
    description: 'Voice generation + voice cloning (29 languages)',
    icon: Mic,
    color: 'text-amber-500',
    url: 'https://elevenlabs.io',
    required: false,
  },
];

export function SettingsTab({ provider, onProviderChange }: SettingsTabProps) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  return (
    <div className="flex flex-col gap-6 p-2">
      {/* ─── API Keys ────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">API Keys</Label>
          <a href="https://vercel.com" target="_blank" rel="noreferrer">
            <span className="text-[10px] text-muted-foreground hover:text-foreground underline">Set in Vercel Dashboard &rarr;</span>
          </a>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-1">
          API keys are stored as environment variables. Add them in your Vercel project settings.
        </p>
        <div className="space-y-2">
          {API_KEYS.map(({ key, label, description, icon: Icon, color, url, required }) => (
            <Card key={key} className="border-border/50">
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <Icon className={`h-4 w-4 mt-0.5 ${color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{label}</span>
                      {required && <span className="text-[9px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-medium">REQUIRED</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{key}</code>
                      <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                        Get key <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ─── Model Provider ──────────────────────────── */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="provider-select" className="text-sm font-medium">Model Provider</Label>
        <Select value={provider} onValueChange={onProviderChange}>
          <SelectTrigger id="provider-select" className="w-full">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openrouter">OpenRouter (Uncensored)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Default: <span className="font-mono">nousresearch/hermes-3-llama-3.1-70b:free</span>
        </p>
      </div>

      {/* ─── Theme ──────────────────────────────── */}
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

      {/* ─── Quick Setup Guide ──────────────────────── */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Quick Setup
          </div>
          <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Get a free OpenRouter key at <a href="https://openrouter.ai/keys" target="_blank" className="underline">openrouter.ai/keys</a></li>
            <li>Go to Vercel Dashboard &rarr; your project &rarr; Settings &rarr; Environment Variables</li>
            <li>Add <code className="bg-muted px-1 rounded">OPENROUTER_API_KEY</code> with your key value</li>
            <li>Redeploy. Chat + image generation will work immediately.</li>
            <li>For video/voice, also add MINIMAX_API_KEY and/or ELEVENLABS_API_KEY</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
