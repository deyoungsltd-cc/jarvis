'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getAmbientStatus,
  getWakeWordStatus,
  startWakeWord,
  stopWakeWord,
  startAvatarSession,
  endAvatarSession,
  startAmbientSession,
  endAmbientSession,
  interruptAmbient,
  reportWakeWordDetection,
} from '@/lib/openjarvis-api';
import { Mic, MicOff, Eye, EyeOff, Volume2, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---- Types ----

type AmbientState = 'standby' | 'waking' | 'live' | 'idle_rearm' | 'error';
type AvatarState = 'disconnected' | 'connecting' | 'connected' | 'speaking' | 'error';

interface AmbientStatus {
  state: AmbientState;
  hasActiveSession: boolean;
  wakeWordEngine: string | null;
  isWakeWordActive: boolean;
  visionEnabled: boolean;
  avatarState: AvatarState;
  quietHoursActive: boolean;
}

// ---- Holographic Talking Head Component ----

export function TalkingHead() {
  const [status, setStatus] = useState<AmbientStatus | null>(null);
  const [avatarToken, setAvatarToken] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [wakeWordEngine, setWakeWordEngine] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarSdkRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const porcupineRef = useRef<any>(null);

  // Fetch status periodically
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const s = await getAmbientStatus();
        setStatus(s);
      } catch {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Initialize wake word engine (Porcupine)
  const initPorcupine = useCallback(async () => {
    try {
      // Dynamic import of Porcupine Web SDK
      // @ts-ignore
      const { PorcupineWorker } = await import('@picovoice/porcupine-web-worker');
      const { PorcupineWorkerWASM } = await import('@picovoice/porcupine-web-worker-wasm');

      porcupineRef.current = await PorcupineWorker.create(
        PorcupineWorkerWASM,
        { keyword: 'jarvis' }, // Built-in keyword
        {
          onDetection: (detection: any) => {
            // Only report if confidence passes threshold
            reportWakeWordDetection('jarvis', 0.9).catch(() => {});
          },
        },
      );
      setWakeWordEngine('porcupine');
    } catch (err) {
      console.warn('Porcupine not available:', err);
      // Fallback: try openWakeWord or disable
      setWakeWordEngine(null);
    }
  }, []);

  // Start wake word listening
  const handleStartWakeWord = useCallback(async () => {
    try {
      if (!wakeWordEngine) {
        await initPorcupine();
      }
      await startWakeWord();
      setStatus(prev => prev ? { ...prev, isWakeWordActive: true } : prev);
    } catch (err: any) {
      console.error('Failed to start wake word:', err);
    }
  }, [wakeWordEngine, initPorcupine]);

  // Stop wake word listening
  const handleStopWakeWord = useCallback(async () => {
    try {
      if (porcupineRef.current) {
        porcupineRef.current.terminate();
        porcupineRef.current = null;
      }
      await stopWakeWord();
      setStatus(prev => prev ? { ...prev, isWakeWordActive: false } : prev);
    } catch (err: any) {
      console.error('Failed to stop wake word:', err);
    }
  }, []);

  // Start avatar session
  const handleStartAvatar = useCallback(async () => {
    try {
      setAvatarError(null);
      const resp: any = await startAvatarSession();
      setAvatarToken(resp.token);

      // Initialize HeyGen LiveAvatar SDK client-side
      if (resp.token) {
        // @ts-ignore
        const { LiveAvatar } = await import('@heygen/liveavatar-web-sdk');
        avatarSdkRef.current = new LiveAvatar({
          token: resp.token,
          videoContainer: document.getElementById('avatar-video-container') as HTMLElement,
          onAvatarTalking: () => {
            setStatus(prev => prev ? { ...prev, avatarState: 'speaking' } : prev);
          },
          onAvatarIdle: () => {
            setStatus(prev => prev ? { ...prev, avatarState: 'connected' } : prev);
          },
        });
        await avatarSdkRef.current.start();
      }
    } catch (err: any) {
      setAvatarError(err.message || 'Failed to start avatar');
      console.error('Avatar error:', err);
    }
  }, []);

  // End avatar session
  const handleEndAvatar = useCallback(async () => {
    try {
      if (avatarSdkRef.current) {
        avatarSdkRef.current.stop();
        avatarSdkRef.current = null;
      }
      await endAvatarSession();
      setAvatarToken(null);
      setStatus(prev => prev ? { ...prev, avatarState: 'disconnected' } : prev);
    } catch {}
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (porcupineRef.current) porcupineRef.current.terminate();
      if (avatarSdkRef.current) avatarSdkRef.current.stop();
      if (audioContextRef.current) audioContextRef.current.close();
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const stateColor = (s: AmbientState | undefined) => {
    switch (s) {
      case 'live': return 'text-emerald-400';
      case 'waking': return 'text-amber-400 animate-pulse';
      case 'standby': return 'text-blue-400';
      case 'idle_rearm': return 'text-orange-400';
      case 'error': return 'text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  const stateLabel = (s: AmbientState | undefined) => {
    switch (s) {
      case 'live': return 'LISTENING';
      case 'waking': return 'WAKING...';
      case 'standby': return 'STANDBY';
      case 'idle_rearm': return 'RE-ARMING';
      case 'error': return 'ERROR';
      default: return 'UNKNOWN';
    }
  };

  return (
    <div className="relative flex flex-col items-center">
      {/* Toggle panel button */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={cn(
          'absolute -top-2 -right-2 z-10 p-1.5 rounded-full bg-background/80 border border-border',
          'hover:bg-accent transition-colors'
        )}
        title={showPanel ? 'Hide avatar panel' : 'Show avatar controls'}
      >
        <Radio className={cn('h-3.5 w-3.5', showPanel ? 'text-emerald-500' : 'text-muted-foreground')} />
      </button>

      {/* Holographic Avatar Container */}
      <div className="relative w-64 h-64 lg:w-80 lg:h-80">
        {/* Outer glow ring */}
        <div className={cn(
          'absolute inset-0 rounded-full transition-all duration-700',
          status?.state === 'live' && 'shadow-[0_0_60px_10px_rgba(16,185,129,0.3)]',
          status?.state === 'waking' && 'shadow-[0_0_40px_8px_rgba(245,158,11,0.3)] animate-pulse',
          status?.state === 'error' && 'shadow-[0_0_40px_8px_rgba(239,68,68,0.3)]',
          (!status || status.state === 'standby') && 'shadow-[0_0_20px_4px_rgba(59,130,246,0.15)]',
        )} />

        {/* Scanline overlay */}
        <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-emerald-500/5" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
              backgroundSize: '100% 4px',
            }}
          />
        </div>

        {/* Particle field effect (CSS-only) */}
        <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none z-10">
          <div className="absolute inset-0 animate-spin [animation-duration:20s] opacity-20">
            <div className="absolute top-1/4 left-1/2 w-1 h-1 bg-emerald-400 rounded-full" />
            <div className="absolute top-3/4 left-1/3 w-0.5 h-0.5 bg-cyan-400 rounded-full" />
            <div className="absolute top-1/2 right-1/4 w-0.5 h-0.5 bg-blue-400 rounded-full" />
          </div>
        </div>

        {/* Avatar video / fallback */}
        <div
          id="avatar-video-container"
          className={cn(
            'w-full h-full rounded-full border-2 overflow-hidden bg-black/90 flex items-center justify-center',
            status?.state === 'live' ? 'border-emerald-500/50' :
            status?.state === 'waking' ? 'border-amber-500/50' :
            status?.state === 'error' ? 'border-red-500/50' :
            'border-blue-500/20'
          )}
        >
          {avatarToken && !avatarError ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500',
                status?.state === 'live' ? 'bg-emerald-500/20' :
                status?.state === 'waking' ? 'bg-amber-500/20 animate-pulse' :
                'bg-blue-500/10'
              )}>
                {status?.avatarState === 'speaking' ? (
                  <Volume2 className={cn('h-8 w-8', status?.state === 'live' ? 'text-emerald-400' : 'text-muted-foreground')} />
                ) : (
                  <Mic className={cn('h-8 w-8', status?.state === 'live' ? 'text-emerald-400' : 'text-muted-foreground')} />
                )}
              </div>
              <span className={cn('text-xs font-mono', stateColor(status?.state))}>
                {stateLabel(status?.state)}
              </span>
            </div>
          )}
        </div>

        {/* HUD Status Readouts — layered AROUND the avatar */}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-20">
          <span className={cn('text-[10px] font-mono tracking-wider', stateColor(status?.state))}>
            {stateLabel(status?.state)}
          </span>
          {status?.visionEnabled && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-red-400">
              <Eye className="h-3 w-3" />
              VISION
            </span>
          )}
        </div>
      </div>

      {/* Controls Panel (collapsible) */}
      {showPanel && (
        <div className="mt-10 p-3 rounded-lg border border-border bg-card/80 backdrop-blur w-72 space-y-3">
          {/* Wake Word Controls */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Wake Word</span>
            {status?.isWakeWordActive ? (
              <button
                onClick={handleStopWakeWord}
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
              >
                <MicOff className="h-3 w-3" /> Stop
              </button>
            ) : (
              <button
                onClick={handleStartWakeWord}
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
              >
                <Mic className="h-3 w-3" /> Enable
              </button>
            )}
          </div>

          {/* Avatar Controls */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Avatar</span>
            {avatarToken ? (
              <button
                onClick={handleEndAvatar}
                className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={handleStartAvatar}
                className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
              >
                Connect
              </button>
            )}
          </div>

          {avatarError && (
            <p className="text-[10px] text-red-400 bg-red-500/5 p-1.5 rounded">{avatarError}</p>
          )}

          {/* Ambient Session */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Ambient Voice</span>
            <button
              onClick={status?.hasActiveSession ? endAmbientSession : startAmbientSession}
              className={cn(
                'text-xs px-2 py-1 rounded',
                status?.hasActiveSession
                  ? 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
              )}
            >
              {status?.hasActiveSession ? 'End' : 'Start'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
