'use client';

import { useState, useEffect, useRef } from 'react';

interface AvatarPanelProps {
  onClose: () => void;
  expanded?: boolean;
}

export function AvatarPanel({ onClose, expanded = true }: AvatarPanelProps) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'speaking' | 'error'>('idle');
  const [avatarEnabled, setAvatarEnabled] = useState(false);
  const [transcript, setTranscript] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const token = localStorage.getItem('openjarvis_token');
        const res = await fetch('/ambient/avatar', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const config = await res.json();
        setAvatarEnabled(config.enabled);
      } catch {}
    }
    loadConfig();
  }, []);

  async function startAvatar() {
    try {
      setStatus('connecting');
      const token = localStorage.getItem('openjarvis_token');
      const res = await fetch('/ambient/avatar/session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const session = await res.json();
      if (videoRef.current && session.sdpOffer) {
        // WebRTC setup would go here — simplified for now
        setStatus('connected');
      }
    } catch (err: any) {
      setStatus('error');
    }
  }

  function getStatusColor() {
    switch (status) {
      case 'idle': return 'from-slate-600 to-slate-800';
      case 'connecting': return 'from-amber-600 to-amber-800';
      case 'connected': return 'from-emerald-600 to-emerald-800';
      case 'speaking': return 'from-blue-500 to-purple-600';
      case 'error': return 'from-red-600 to-red-800';
      default: return 'from-slate-600 to-slate-800';
    }
  }

  function getStatusLabel() {
    switch (status) {
      case 'idle': return 'Standby';
      case 'connecting': return 'Connecting...';
      case 'connected': return 'Active';
      case 'speaking': return 'Speaking';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  }

  if (!expanded) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-center gap-2">
        <button
          onClick={onClose}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium shadow-lg shadow-purple-500/25 hover:shadow-purple-500/50 transition-all hover:scale-110"
          style={{ animation: 'pulse-glow 2s ease-in-out infinite' }}
        >
          J
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative w-full max-w-md mx-auto rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1117 50%, #0a0a1a 100%)' }}
    >
      {/* Holographic scan lines overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-10 opacity-[0.03]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(100, 200, 255, 0.1) 2px, rgba(100, 200, 255, 0.1) 4px)',
        }}
      />

      {/* Holographic glow border */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none z-10"
        style={{
          boxShadow: 'inset 0 0 30px rgba(100, 150, 255, 0.1), 0 0 20px rgba(100, 150, 255, 0.05)',
        }}
      />

      {/* Header */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              status === 'error'
                ? 'bg-red-500'
                : status === 'speaking'
                  ? 'bg-blue-400 animate-pulse'
                  : status === 'connected'
                    ? 'bg-emerald-400'
                    : 'bg-slate-500'
            }`}
          />
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Avatar</span>
          <span className="text-xs text-slate-500">{getStatusLabel()}</span>
        </div>
        <div className="flex items-center gap-2">
          {!avatarEnabled && (
            <button
              onClick={startAvatar}
              className="text-xs px-3 py-1 rounded-md bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors border border-blue-500/20"
            >
              Enable
            </button>
          )}
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors text-sm"
          >
            &#x2715;
          </button>
        </div>
      </div>

      {/* Video / Avatar area */}
      <div className={`relative z-20 aspect-video bg-gradient-to-br ${getStatusColor()} flex items-center justify-center`}>
        {status === 'idle' ? (
          <div className="text-center">
            <div
              className="text-4xl font-light text-white/20 font-mono tracking-widest"
              style={{ textShadow: '0 0 20px rgba(100, 200, 255, 0.3)' }}
            >
              JARVIS
            </div>
            <div className="text-xs text-white/10 mt-2 font-mono">Standby Mode</div>
          </div>
        ) : status === 'connecting' ? (
          <div className="text-center animate-pulse">
            <div className="text-lg text-white/40">Connecting to avatar service...</div>
          </div>
        ) : status === 'error' ? (
          <div className="text-center">
            <div className="text-red-400/60 text-sm">Avatar service unavailable</div>
            <div className="text-xs text-slate-600 mt-1">Check API key configuration</div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Transcript overlay */}
      {transcript && (
        <div className="absolute bottom-16 left-4 right-4 z-20">
          <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/5">
            <p className="text-sm text-white/80 font-light">{transcript}</p>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="relative z-20 px-4 py-2 border-t border-white/5 flex items-center justify-between">
        <span className="text-[10px] font-mono text-slate-600">AMBIENT PRESENCE v1.0</span>
        <span
          className={`text-[10px] font-mono ${
            status === 'connected' || status === 'speaking'
              ? 'text-emerald-500/60'
              : 'text-slate-600'
          }`}
        >
          {status === 'speaking'
            ? 'LIVE'
            : status === 'connected'
              ? 'READY'
              : 'OFFLINE'}
        </span>
      </div>
    </div>
  );
}
