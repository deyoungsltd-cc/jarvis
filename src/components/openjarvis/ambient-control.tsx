'use client';

import { useState, useEffect } from 'react';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';

export function AmbientControl() {
  const [wakeWord, setWakeWord] = useState({
    enabled: false,
    engine: 'porcupine',
    keyword: 'jarvis'
  });
  const [voiceSession, setVoiceSession] = useState<{ id: string; status: string } | null>(null);
  const [proactive, setProactive] = useState({ enabled: false, triggers: 0 });
  const [avatar, setAvatar] = useState({ enabled: false, provider: 'heygen' });
  const [costTier, setCostTier] = useState('tier_0');

  useEffect(() => {
    async function loadState() {
      try {
        const token = localStorage.getItem('openjarvis_token');
        const headers = { Authorization: `Bearer ${token}` };
        const [ww, ps, av, pt] = await Promise.all([
          fetch('/ambient/wakeword', { headers }).then(r => r.json()),
          fetch('/ambient/proactive', { headers }).then(r => r.json()),
          fetch('/ambient/avatar', { headers }).then(r => r.json()),
          fetch('/providers/tier', { headers }).then(r => r.json()),
        ]);
        setWakeWord(ww);
        setProactive({ enabled: ps.enabled, triggers: JSON.parse(ps.triggers).length });
        setAvatar({ enabled: av.enabled, provider: av.provider });
        setCostTier(pt.name);
      } catch {}
    }
    loadState();
  }, []);

  async function toggleWakeWord(enabled: boolean) {
    try {
      const token = localStorage.getItem('openjarvis_token');
      await fetch('/ambient/wakeword', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled }),
      });
      setWakeWord(prev => ({ ...prev, enabled }));
    } catch {}
  }

  async function toggleProactive(enabled: boolean) {
    try {
      const token = localStorage.getItem('openjarvis_token');
      await fetch('/ambient/proactive', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled }),
      });
      setProactive(prev => ({ ...prev, enabled }));
    } catch {}
  }

  async function toggleAvatar(enabled: boolean) {
    try {
      const token = localStorage.getItem('openjarvis_token');
      await fetch('/ambient/avatar', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled }),
      });
      setAvatar(prev => ({ ...prev, enabled }));
    } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-slate-200">Ambient Presence</h3>
          <p className="text-xs text-slate-500">Wake word, voice, and avatar controls</p>
        </div>
        <Badge variant={costTier === 'tier_0' ? 'secondary' : 'default'}>
          {costTier === 'tier_0' ? 'Free Only' : costTier === 'tier_1' ? 'Light Paid' : 'Scaled'}
        </Badge>
      </div>

      {/* Wake Word */}
      <div className="flex items-center justify-between py-2 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono ${
              wakeWord.enabled
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/30'
                : 'bg-slate-900 text-slate-600 border border-slate-800'
            }`}
          >
            WW
          </div>
          <div>
            <p className="text-sm text-slate-300">Wake Word</p>
            <p className="text-xs text-slate-600">{wakeWord.engine} — "{wakeWord.keyword}"</p>
          </div>
        </div>
        <Switch checked={wakeWord.enabled} onCheckedChange={toggleWakeWord} />
      </div>

      {/* Proactive Speech */}
      <div className="flex items-center justify-between py-2 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono ${
              proactive.enabled
                ? 'bg-blue-950 text-blue-400 border border-blue-800/30'
                : 'bg-slate-900 text-slate-600 border border-slate-800'
            }`}
          >
            PS
          </div>
          <div>
            <p className="text-sm text-slate-300">Proactive Speech</p>
            <p className="text-xs text-slate-600">{proactive.triggers} triggers configured</p>
          </div>
        </div>
        <Switch checked={proactive.enabled} onCheckedChange={toggleProactive} />
      </div>

      {/* Avatar */}
      <div className="flex items-center justify-between py-2 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono ${
              avatar.enabled
                ? 'bg-purple-950 text-purple-400 border border-purple-800/30'
                : 'bg-slate-900 text-slate-600 border border-slate-800'
            }`}
          >
            AV
          </div>
          <div>
            <p className="text-sm text-slate-300">Avatar</p>
            <p className="text-xs text-slate-600">{avatar.provider} {avatar.enabled ? '(active)' : '(off — no free tier)'}</p>
          </div>
        </div>
        <Switch checked={avatar.enabled} onCheckedChange={toggleAvatar} />
      </div>

      {/* Ambient Voice Session */}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono ${
              voiceSession
                ? 'bg-green-950 text-green-400 border border-green-800/30'
                : 'bg-slate-900 text-slate-600 border border-slate-800'
            }`}
          >
            LV
          </div>
          <div>
            <p className="text-sm text-slate-300">Ambient Voice</p>
            <p className="text-xs text-slate-600">{voiceSession ? `Session active (${voiceSession.status})` : 'No active session'}</p>
          </div>
        </div>
        <Badge variant={voiceSession ? 'default' : 'outline'}>
          {voiceSession ? 'Live' : 'Idle'}
        </Badge>
      </div>
    </div>
  );
}
