/**
 * Sound Effects Manager — Round 3
 *
 * Generates JARVIS-style sound effects using the Web Audio API.
 * No audio files needed — all sounds are synthesized programmatically.
 * Respects a `soundsEnabled` flag in localStorage (default: true).
 */

// ---- Types ----

export interface SoundEffects {
  playActivation: () => void;
  playSuccess: () => void;
  playError: () => void;
  playNotification: () => void;
  playWakeWord: () => void;
  toggleSounds: () => boolean;
  isSoundsEnabled: () => boolean;
}

// ---- Local Storage Key ----

const STORAGE_KEY = 'openjarvis-sounds-enabled';

// ---- Audio Context (lazy init) ----

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Resume if suspended (required after user interaction in some browsers)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// ---- Helpers ----

function isSoundsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === 'true';
}

function toggleSounds(): boolean {
  const current = isSoundsEnabled();
  const next = !current;
  localStorage.setItem(STORAGE_KEY, String(next));
  return next;
}

/** Create an oscillator tone and play it. */
function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume: number = 0.15,
  startDelay: number = 0,
): void {
  const ctx = getAudioContext();
  if (!ctx || !isSoundsEnabled()) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime + startDelay);

  gain.gain.setValueAtTime(0, ctx.currentTime + startDelay);
  // Fade in
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startDelay + 0.01);
  // Fade out
  gain.gain.setValueAtTime(volume, ctx.currentTime + startDelay + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startDelay + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime + startDelay);
  osc.stop(ctx.currentTime + startDelay + duration);
}

// ---- Sound Effects ----

/** JARVIS activated — short ascending tone sweep */
function playActivation(): void {
  const ctx = getAudioContext();
  if (!ctx || !isSoundsEnabled()) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.15);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.02);
  gain.gain.setValueAtTime(0.12, ctx.currentTime + 0.12);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.2);
}

/** Task completed — two-tone ascending chime */
function playSuccess(): void {
  playTone(523.25, 0.15, 'sine', 0.12, 0);    // C5
  playTone(659.25, 0.2, 'sine', 0.12, 0.15);  // E5
}

/** Error — low buzz */
function playError(): void {
  const ctx = getAudioContext();
  if (!ctx || !isSoundsEnabled()) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(110, ctx.currentTime);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.02);
  gain.gain.setValueAtTime(0.08, ctx.currentTime + 0.2);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

/** Incoming notification — gentle ping */
function playNotification(): void {
  const ctx = getAudioContext();
  if (!ctx || !isSoundsEnabled()) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, ctx.currentTime);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.005);
  gain.gain.setValueAtTime(0.08, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
}

/** Wake word detected — distinct triple-beep */
function playWakeWord(): void {
  playTone(880, 0.08, 'sine', 0.12, 0);     // First beep
  playTone(1100, 0.08, 'sine', 0.12, 0.12); // Second beep (higher)
  playTone(1320, 0.12, 'sine', 0.12, 0.24); // Third beep (highest, longer)
}

// ---- Exported Singleton ----

export const soundEffects: SoundEffects = {
  playActivation,
  playSuccess,
  playError,
  playNotification,
  playWakeWord,
  toggleSounds,
  isSoundsEnabled,
};
