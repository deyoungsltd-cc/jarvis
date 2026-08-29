'use client';

import { useState, useEffect } from 'react';

export function WakeWordIndicator() {
  const [enabled, setEnabled] = useState(false);
  const [engine, setEngine] = useState('porcupine');
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      try {
        const token = localStorage.getItem('openjarvis_token');
        const res = await fetch('/ambient/wakeword', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const config = await res.json();
        setEnabled(config.enabled);
        setEngine(config.engine);
      } catch {}
    }
    loadConfig();

    // Listen for wake word detection events (would come via WebSocket in production)
    const timer = setTimeout(() => setDetected(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-500 ${
        enabled
          ? detected
            ? 'border-amber-400/50 bg-amber-950/30 shadow-lg shadow-amber-500/20'
            : 'border-emerald-500/20 bg-emerald-950/20'
          : 'border-slate-700/50 bg-slate-900/30 opacity-50'
      }`}
    >
      <div
        className={`w-2 h-2 rounded-full transition-all duration-300 ${
          enabled
            ? detected
              ? 'bg-amber-400 animate-ping'
              : 'bg-emerald-400'
            : 'bg-slate-600'
        }`}
      />
      <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
        {enabled ? (detected ? 'Hey Jarvis!' : `Listening (${engine})`) : 'Wake Word Off'}
      </span>
    </div>
  );
}
