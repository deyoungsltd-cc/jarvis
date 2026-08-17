'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import {
  createVoiceSession,
  addVoiceTranscript,
  setVoiceSessionStatus,
} from '@/lib/openjarvis-api';
import type { VoiceSessionStatus as VSS } from '@/lib/openjarvis-types';

// ---- Types ----
interface TranscriptLine {
  id: string;
  direction: 'user' | 'agent';
  text: string;
  timestamp: number;
  confidence?: number;
}

interface VoiceControlProps {
  onTranscript?: (text: string) => void;
  disabled?: boolean;
  language?: string;
}

// ---- Web Speech API type declarations ----
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export function VoiceControl({ onTranscript, disabled, language = 'en-US' }: VoiceControlProps) {
  // ---- State ----
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [interimText, setInterimText] = useState('');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  // ---- Check browser support on mount ----
  useEffect(() => {
    const hasSTT = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    const hasTTS = 'speechSynthesis' in window;
    setSttSupported(hasSTT);
    setTtsSupported(hasTTS);
  }, []);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // ---- Audio level visualization ----
  const startAudioVisualization = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(avg / 255);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch {
      // Visualization is best-effort; STT still works without it
    }
  }, []);

  const stopAudioVisualization = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    setAudioLevel(0);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
      analyserRef.current = null;
    }
  }, []);

  // ---- Create voice session ----
  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    try {
      const session = await createVoiceSession({ language });
      setSessionId(session.id);
      return session.id;
    } catch {
      return null;
    }
  }, [sessionId, language]);

  // ---- Start listening ----
  const startListening = useCallback(async () => {
    if (isListening || disabled) return;
    setError(null);

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText('');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimText(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setError(`Speech error: ${event.error}`);
      }
    };

    recognition.onend = async () => {
      setIsListening(false);
      stopAudioVisualization();

      const text = finalTranscript.trim();
      if (text) {
        const sid = await ensureSession();
        if (sid) {
          try {
            await setVoiceSessionStatus(sid, 'processing');
            await addVoiceTranscript(sid, text, 'user');
          } catch {}
        }

        const entry: TranscriptLine = {
          id: crypto.randomUUID(),
          direction: 'user',
          text,
          timestamp: Date.now(),
        };
        setTranscript(prev => [...prev, entry]);
        onTranscript?.(text);

        if (sid) {
          try { await setVoiceSessionStatus(sid, 'idle'); } catch {}
        }
      }
      setInterimText('');
    };

    recognitionRef.current = recognition;
    recognition.start();
    startAudioVisualization();

    // Also update server session status
    const sid = await ensureSession();
    if (sid) {
      try { await setVoiceSessionStatus(sid, 'listening'); } catch {}
    }
  }, [isListening, disabled, language, ensureSession, startAudioVisualization, stopAudioVisualization, onTranscript]);

  // ---- Stop listening ----
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    stopAudioVisualization();
  }, [stopAudioVisualization]);

  // ---- TTS: Speak text ----
  const speak = useCallback((text: string) => {
    if (!ttsEnabled || !('speechSynthesis' in window)) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Try to pick a matching voice
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(v => v.lang.startsWith(language.split('-')[0]));
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled, language]);

  // Expose speak for parent to call when agent responds
  // We use a ref pattern so the parent can trigger TTS
  useEffect(() => {
    // Store speak function on the window for programmatic access
    (window as any).__openjarvis_speak = speak;
    return () => { delete (window as any).__openjarvis_speak; };
  }, [speak]);

  // ---- Toggle mic ----
  const toggleMic = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // ---- Clear transcript ----
  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setInterimText('');
  }, []);

  // ---- Not supported state ----
  if (!sttSupported) {
    return (
      <div className="flex flex-col gap-2 p-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30">
        <div className="flex items-center gap-2">
          <MicOff className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Voice input not supported in this browser
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Use Chrome, Edge, or Safari for Web Speech API support
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Controls Row */}
      <div className="flex items-center gap-2">
        <Button
          variant={isListening ? 'destructive' : 'default'}
          size="icon"
          onClick={toggleMic}
          disabled={disabled}
          className="relative h-10 w-10 rounded-full"
          aria-label={isListening ? 'Stop listening' : 'Start listening'}
        >
          {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}

          {/* Pulse ring when listening */}
          {isListening && (
            <span className="absolute inset-0 rounded-full animate-ping bg-red-400/40" />
          )}
        </Button>

        {/* Audio level bar */}
        <div className="flex-1 h-8 flex items-center gap-1">
          {isListening && (
            <div className="flex items-center gap-[2px] h-full w-full">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(8, audioLevel * 100 * (0.5 + Math.random() * 0.5))}%`,
                    backgroundColor: isListening
                      ? `hsl(var(--primary) / ${0.3 + audioLevel * 0.7})`
                      : 'hsl(var(--muted))',
                  }}
                />
              ))}
            </div>
          )}
          {isSpeaking && !isListening && (
            <div className="flex items-center gap-[2px] h-full w-full">
              {Array.from({ length: 20 }).map((_, i) => {
                const wave = Math.sin(Date.now() / 200 + i * 0.5) * 0.5 + 0.5;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-full transition-all duration-100"
                    style={{
                      height: `${8 + wave * 24}%`,
                      backgroundColor: 'hsl(var(--primary) / 0.5)',
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* TTS toggle */}
        {ttsSupported && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setTtsEnabled(prev => !prev);
              if (ttsEnabled) window.speechSynthesis.cancel();
            }}
            className={`h-10 w-10 ${ttsEnabled ? 'text-foreground' : 'text-muted-foreground'}`}
            aria-label={ttsEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
            title={ttsEnabled ? 'TTS on' : 'TTS off'}
          >
            {ttsEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </Button>
        )}
      </div>

      {/* Status indicator */}
      {isListening && (
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-muted-foreground">Listening...</span>
          {interimText && (
            <span className="text-muted-foreground italic truncate">{interimText}</span>
          )}
        </div>
      )}
      {isSpeaking && (
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-muted-foreground">Speaking...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}

      {/* Transcript history */}
      {transcript.length > 0 && (
        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Transcript</span>
            <button
              onClick={clearTranscript}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
          {transcript.map(line => (
            <div
              key={line.id}
              className={`text-sm ${line.direction === 'user' ? 'text-foreground' : 'text-blue-600 dark:text-blue-400'}`}
            >
              <span className="text-xs font-mono text-muted-foreground mr-1">
                {line.direction === 'user' ? 'You' : 'Agent'}:
              </span>
              {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}