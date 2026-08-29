/**
 * Wake Word Detector — Server-Side Always-Listening System
 *
 * Hybrid approach:
 * 1. Energy-based VAD to detect voice activity
 * 2. Short audio chunk recording via sox/ffmpeg
 * 3. STT transcription (Gemini/Groq) to check for wake phrase
 * 4. Full command capture on wake word match
 *
 * Gracefully degrades when mic or STT is unavailable.
 *
 * Config via env vars:
 *   WAKE_WORD_ENABLED=false
 *   WAKE_WORD="hey jarvis"
 *   WAKE_WORD_SENSITIVITY=0.5
 *   WAKE_WORD_CHUNK_MS=2000
 *   WAKE_WORD_COMMAND_TIMEOUT_MS=8000
 */
import { EventEmitter } from 'events';
import { spawn, ChildProcess, execSync } from 'child_process';
import { writeFileSync, existsSync, unlinkSync, readFileSync } from 'fs';
import {
  getProvider,
  getActiveProviderName,
  initVoiceSystem,
  getAvailableProviders,
} from '@/lib/api/voiceManager.js';
import { logger } from '@/lib/api/logger';
import { eventBus } from '@/lib/api/event-bus';
import { VoiceError } from '@/lib/api/types.js';

// ---- Types ----

export type WakeWordState =
  | 'idle'
  | 'listening'
  | 'recording-chunk'
  | 'transcribing'
  | 'command-listening'
  | 'command-recording'
  | 'command-transcribing';

export type WakeWordEvent =
  | 'wake-word-detected'
  | 'command-detected'
  | 'silence-timeout'
  | 'error'
  | 'state-change'
  | 'debug';

export interface WakeWordStatus {
  enabled: boolean;
  available: boolean;
  state: WakeWordState;
  wakeWord: string;
  sensitivity: number;
  chunkDurationMs: number;
  commandTimeoutMs: number;
  transcriptionCount: number;
  wakeWordCount: number;
  errorCount: number;
  lastError?: string;
  micAvailable: boolean;
  sttAvailable: boolean;
}

// ---- Configuration ----

const WAKE_WORD_ENABLED = process.env.WAKE_WORD_ENABLED === 'true';
const WAKE_WORD = (process.env.WAKE_WORD || 'hey jarvis').toLowerCase();
const WAKE_WORD_SENSITIVITY = parseFloat(process.env.WAKE_WORD_SENSITIVITY || '0.5');
const CHUNK_DURATION_MS = parseInt(process.env.WAKE_WORD_CHUNK_MS || '2000', 10);
const COMMAND_TIMEOUT_MS = parseInt(process.env.WAKE_WORD_COMMAND_TIMEOUT_MS || '8000', 10);
// Energy threshold: higher sensitivity → lower threshold
const ENERGY_THRESHOLD = 0.02 + (1.0 - WAKE_WORD_SENSITIVITY) * 0.08;

// ---- Singleton ----

let instance: WakeWordDetector | null = null;

export function getWakeWordDetector(): WakeWordDetector {
  if (!instance) {
    instance = new WakeWordDetector();
  }
  return instance;
}

// ---- WakeWordDetector Class ----

export class WakeWordDetector extends EventEmitter {
  private state: WakeWordState = 'idle';
  private chunkRecorder: ChildProcess | null = null;
  private commandRecorder: ChildProcess | null = null;
  private commandTimeout: ReturnType<typeof setTimeout> | null = null;
  private loopInterval: ReturnType<typeof setInterval> | null = null;
  private isAvailable = false;
  private micAvailable = false;
  private sttAvailable = false;
  private sttProviderName = '';
  private transcriptionCount = 0;
  private wakeWordCount = 0;
  private errorCount = 0;
  private lastError: string | undefined;
  private chunkPath = '/tmp/jarvis-wake-chunk.wav';
  private commandPath = '/tmp/jarvis-command.wav';
  private activeDevice = '';

  constructor() {
    super();
    this.setMaxListeners(50);
    this.probeAvailability();
  }

  // ---- Availability Probing ----

  private probeAvailability(): void {
    // Check STT: need a non-browser provider with STT capability
    try {
      initVoiceSystem();
      const providers = getAvailableProviders();
      const serverProviders = providers.filter((p) => p !== 'browser');
      this.sttAvailable = serverProviders.length > 0;
      if (this.sttAvailable) {
        this.sttProviderName = serverProviders[0];
        logger.info('wake-word', `Server-side STT available via: ${serverProviders.join(', ')}`);
      } else {
        logger.warn('wake-word', 'No server-side STT provider. Wake word requires GEMINI_API_KEY or GROQ_API_KEY.');
      }
    } catch (err: any) {
      this.sttAvailable = false;
      logger.warn('wake-word', `STT probe failed: ${err.message}`);
    }

    // Check mic: try sox or arecord or ffmpeg
    this.probeMicrophone();
  }

  private probeMicrophone(): void {
    const tools = ['sox', 'arecord', 'ffmpeg'];
    let found = false;
    for (const tool of tools) {
      try {
        execSync(`which ${tool} 2>/dev/null`, { stdio: 'pipe' });
        if (tool === 'sox') {
          this.activeDevice = 'default';
          this.micAvailable = true;
          found = true;
          logger.info('wake-word', 'Microphone available via sox (waveaudio/default)');
          break;
        } else if (tool === 'arecord') {
          this.activeDevice = 'default';
          this.micAvailable = true;
          found = true;
          logger.info('wake-word', 'Microphone available via arecord (ALSA)');
          break;
        } else if (tool === 'ffmpeg') {
          this.activeDevice = 'default';
          this.micAvailable = true;
          found = true;
          logger.info('wake-word', 'Microphone available via ffmpeg');
          break;
        }
      } catch {
        // not found, try next
      }
    }
    if (!found) {
      logger.warn('wake-word', 'No microphone tool found. Install sox, arecord, or ffmpeg.');
    }
    this.updateAvailability();
  }

  private updateAvailability(): void {
    this.isAvailable = this.micAvailable && this.sttAvailable;
  }

  // ---- Public API ----

  getStatus(): WakeWordStatus {
    return {
      enabled: WAKE_WORD_ENABLED && this.state !== 'idle',
      available: this.isAvailable,
      state: this.state,
      wakeWord: WAKE_WORD,
      sensitivity: WAKE_WORD_SENSITIVITY,
      chunkDurationMs: CHUNK_DURATION_MS,
      commandTimeoutMs: COMMAND_TIMEOUT_MS,
      transcriptionCount: this.transcriptionCount,
      wakeWordCount: this.wakeWordCount,
      errorCount: this.errorCount,
      lastError: this.lastError,
      micAvailable: this.micAvailable,
      sttAvailable: this.sttAvailable,
    };
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') {
      logger.warn('wake-word', `Cannot start: already in state "${this.state}"`);
      return;
    }
    if (!this.isAvailable) {
      const msg = !this.micAvailable
        ? 'Microphone not available (install sox, arecord, or ffmpeg)'
        : 'Server-side STT not available (set GEMINI_API_KEY or GROQ_API_KEY)';
      this.lastError = msg;
      logger.warn('wake-word', msg);
      this.emit('error', { message: msg });
      eventBus.emit('wake-word:error', { message: msg });
      return;
    }

    this.setState('listening');
    logger.info(
      'wake-word',
      `Always-listening started. Wake word: "${WAKE_WORD}", sensitivity: ${WAKE_WORD_SENSITIVITY}, device: ${this.activeDevice}`
    );
    this.startListeningLoop();
  }

  async stop(): Promise<void> {
    if (this.state === 'idle') return;
    this.cleanupAll();
    this.setState('idle');
    logger.info('wake-word', 'Always-listening stopped');
  }

  // ---- State Machine ----

  private setState(newState: WakeWordState): void {
    const oldState = this.state;
    this.state = newState;
    this.emit('state-change', { from: oldState, to: newState });
    eventBus.emit('wake-word:state', {
      state: newState,
      previousState: oldState,
      timestamp: new Date().toISOString(),
    });
  }

  // ---- Recording Tools ----

  private getRecordCommand(durationSec: number, outputPath: string): { cmd: string; args: string[] } | null {
    // Try sox first (best cross-platform for simple recording)
    try {
      execSync('which sox 2>/dev/null', { stdio: 'pipe' });
      return {
        cmd: 'sox',
        args: ['-t', 'waveaudio', '-d', '-r', '16000', '-c', '1', outputPath, 'trim', '0', String(durationSec)],
      };
    } catch {
      // not sox
    }

    // Try arecord (ALSA on Linux)
    try {
      execSync('which arecord 2>/dev/null', { stdio: 'pipe' });
      return {
        cmd: 'arecord',
        args: ['-f', 'S16_LE', '-r', '16000', '-c', '1', '-d', String(durationSec), outputPath],
      };
    } catch {
      // not arecord
    }

    // Try ffmpeg
    try {
      execSync('which ffmpeg 2>/dev/null', { stdio: 'pipe' });
      return {
        cmd: 'ffmpeg',
        args: [
          '-y',
          '-f', 'lavfi', '-i', 'anullsrc',
          '-f', this.activeDevice || 'pulse',
          '-i', this.activeDevice || 'default',
          '-t', String(durationSec),
          '-map', '1:a',
          '-ar', '16000',
          '-ac', '1',
          '-loglevel', 'error',
          outputPath,
        ],
      };
    } catch {
      // not ffmpeg
    }

    return null;
  }

  private getEnergyCommand(): { cmd: string; args: string[] } | null {
    try {
      execSync('which sox 2>/dev/null', { stdio: 'pipe' });
      return {
        cmd: 'sox',
        args: ['-t', 'waveaudio', '-d', '-n', 'stat', 'trim', '0', '0.25'],
      };
    } catch {
      // not sox
    }

    try {
      execSync('which arecord 2>/dev/null', { stdio: 'pipe' });
      return {
        cmd: 'arecord',
        args: ['-f', 'S16_LE', '-r', '16000', '-c', '1', '-d', '1', '/tmp/jarvis-energy-check.raw'],
      };
    } catch {
      // not arecord
    }

    return null;
  }

  // ---- Listening Loop ----

  private startListeningLoop(): void {
    if (this.loopInterval) clearInterval(this.loopInterval);

    // Poll audio energy every 500ms
    this.loopInterval = setInterval(() => {
      if (this.state !== 'listening') return;
      this.checkAudioEnergy();
    }, 500);
  }

  private checkAudioEnergy(): void {
    const cmd = this.getEnergyCommand();
    if (!cmd) return;

    try {
      const proc = spawn(cmd.cmd, cmd.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
      }, 3000);

      proc.on('exit', (code) => {
        clearTimeout(timeout);
        if (code === 0 || code === null) {
          const rms = this.parseRMSFromStats(stderr);
          if (rms > ENERGY_THRESHOLD) {
            this.onVoiceDetected();
          }
        }
      });

      proc.on('error', () => {
        clearTimeout(timeout);
      });
    } catch {
      // Silently continue polling
    }
  }

  /**
   * Parse RMS from sox stat output.
   * sox stat outputs lines like: "RMS amplitude: 0.123"
   */
  private parseRMSFromStats(statsOutput: string): number {
    const match = statsOutput.match(/RMS\s+amplitude:\s*([\d.]+)/i);
    if (match) return parseFloat(match[1]);

    // For arecord raw file, compute RMS from the raw PCM data
    if (existsSync('/tmp/jarvis-energy-check.raw')) {
      try {
        const buf = readFileSync('/tmp/jarvis-energy-check.raw');
        let sumSquares = 0;
        const samples = buf.length / 2;
        for (let i = 0; i < buf.length - 1; i += 2) {
          const sample = buf.readInt16LE(i);
          sumSquares += (sample * sample) / (32768 * 32768);
        }
        const rms = Math.sqrt(sumSquares / Math.max(samples, 1));
        return rms;
      } catch {
        // fallback
      }
    }

    return 0;
  }

  // ---- Voice Detection → Chunk Recording → Transcription ----

  private async onVoiceDetected(): Promise<void> {
    if (this.state !== 'listening') return;

    // Pause the polling loop while recording
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }

    this.setState('recording-chunk');

    const durationSec = CHUNK_DURATION_MS / 1000;
    const recCmd = this.getRecordCommand(durationSec, this.chunkPath);
    if (!recCmd) {
      this.handleError('No recording tool available');
      return;
    }

    try {
      await this.runRecording(recCmd.cmd, recCmd.args);
      this.setState('transcribing');
      await this.transcribeChunk();
    } catch (err: any) {
      this.handleError(err.message || 'Recording failed');
    }
  }

  private runRecording(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.chunkRecorder = proc;

      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve(); // Resolve even on timeout — we'll use whatever was recorded
      }, (CHUNK_DURATION_MS + 2000));

      proc.on('exit', (code) => {
        clearTimeout(timeout);
        this.chunkRecorder = null;
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Recording process exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        this.chunkRecorder = null;
        reject(err);
      });
    });
  }

  private async transcribeChunk(): Promise<void> {
    if (!existsSync(this.chunkPath)) {
      this.handleError('Recorded chunk file not found');
      return;
    }

    try {
      const audioBuffer = readFileSync(this.chunkPath);
      const provider = getProvider(this.sttProviderName);
      if (!provider || !provider.capabilities.includes('stt')) {
        this.handleError('STT provider not available for transcription');
        return;
      }

      const result = await provider.transcribe(audioBuffer, { language: 'en-US' });
      this.transcriptionCount++;

      const text = result.text.toLowerCase().trim();
      this.emit('debug', { type: 'chunk-transcription', text: result.text, confidence: result.confidence });
      logger.debug('wake-word', `Chunk transcription: "${result.text}" (confidence: ${result.confidence})`);

      if (this.containsWakeWord(text)) {
        this.wakeWordCount++;
        logger.info('wake-word', `Wake word detected! Text: "${result.text}"`);
        this.emit('wake-word-detected', {
          text: result.text,
          confidence: result.confidence,
          timestamp: new Date().toISOString(),
        });
        eventBus.emit('wake-word:detected', {
          text: result.text,
          confidence: result.confidence,
          timestamp: new Date().toISOString(),
        });
        // Transition to command listening
        await this.startCommandListening();
        return;
      }

      // No wake word — go back to listening
      this.setState('listening');
      this.startListeningLoop();
    } catch (err: any) {
      this.handleError(`Transcription failed: ${err.message}`);
    }
  }

  private containsWakeWord(text: string): boolean {
    const words = WAKE_WORD.split(' ');
    // Exact wake word match
    if (text.includes(WAKE_WORD)) return true;
    // Partial match: if wake word has multiple words, check for just the trigger word
    if (words.length > 1) {
      const triggerWord = words[words.length - 1]; // e.g. "jarvis" from "hey jarvis"
      if (text.includes(triggerWord)) return true;
    }
    return false;
  }

  // ---- Command Listening (after wake word) ----

  private async startCommandListening(): Promise<void> {
    this.setState('command-listening');
    logger.info('wake-word', 'Listening for command...');

    // Start recording command audio
    const durationSec = COMMAND_TIMEOUT_MS / 1000;
    const recCmd = this.getRecordCommand(durationSec, this.commandPath);
    if (!recCmd) {
      this.handleError('No recording tool for command capture');
      return;
    }

    // Set silence timeout
    this.commandTimeout = setTimeout(() => {
      this.onSilenceTimeout();
    }, COMMAND_TIMEOUT_MS);

    this.setState('command-recording');

    try {
      await this.runCommandRecording(recCmd.cmd, recCmd.args);
      // Recording finished (either naturally or via timeout kill)
      await this.transcribeCommand();
    } catch (err: any) {
      this.handleError(`Command recording failed: ${err.message}`);
    }
  }

  private runCommandRecording(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.commandRecorder = proc;

      proc.on('exit', (code) => {
        this.commandRecorder = null;
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`Command recording exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        this.commandRecorder = null;
        reject(err);
      });
    });
  }

  private async transcribeCommand(): Promise<void> {
    if (this.commandTimeout) {
      clearTimeout(this.commandTimeout);
      this.commandTimeout = null;
    }

    if (!existsSync(this.commandPath)) {
      this.setState('listening');
      this.startListeningLoop();
      return;
    }

    this.setState('command-transcribing');

    try {
      const audioBuffer = readFileSync(this.commandPath);
      const provider = getProvider(this.sttProviderName);
      if (!provider || !provider.capabilities.includes('stt')) {
        this.handleError('STT provider not available for command transcription');
        return;
      }

      const result = await provider.transcribe(audioBuffer, { language: 'en-US' });
      this.transcriptionCount++;

      const text = result.text.trim();
      this.emit('debug', { type: 'command-transcription', text, confidence: result.confidence });
      logger.info('wake-word', `Command detected: "${text}" (confidence: ${result.confidence})`);

      // Remove the wake word from the command text
      const cleanedCommand = this.removeWakeWord(text);

      if (cleanedCommand.length > 0) {
        this.emit('command-detected', {
          text: cleanedCommand,
          rawText: text,
          confidence: result.confidence,
          timestamp: new Date().toISOString(),
        });
        eventBus.emit('wake-word:command', {
          text: cleanedCommand,
          rawText: text,
          confidence: result.confidence,
          timestamp: new Date().toISOString(),
        });
      } else {
        // Just the wake word, no command
        logger.info('wake-word', 'Wake word detected but no command followed');
        this.emit('silence-timeout', { message: 'No command after wake word' });
        eventBus.emit('wake-word:silence', {
          message: 'No command after wake word',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      logger.warn('wake-word', `Command transcription failed: ${err.message}`);
      this.emit('silence-timeout', { message: `Command transcription failed: ${err.message}` });
      eventBus.emit('wake-word:silence', {
        message: `Command transcription failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      // Return to listening mode
      this.setState('listening');
      this.startListeningLoop();
    }
  }

  private removeWakeWord(text: string): string {
    const lower = text.toLowerCase();
    let cleaned = lower;
    // Remove the full wake word phrase
    cleaned = cleaned.replace(WAKE_WORD, '');
    // Also remove just the trigger word if present
    const words = WAKE_WORD.split(' ');
    if (words.length > 1) {
      const triggerWord = words[words.length - 1];
      cleaned = cleaned.replace(triggerWord, '');
    }
    // Clean up
    cleaned = cleaned.replace(/^\s*[,.]?\s*/, '').replace(/\s*[,.]?\s*$/, '').trim();
    return cleaned;
  }

  private onSilenceTimeout(): void {
    logger.info('wake-word', 'Silence timeout — no command detected');
    this.emit('silence-timeout', { message: 'Timeout waiting for command' });
    eventBus.emit('wake-word:silence', {
      message: 'Timeout waiting for command',
      timestamp: new Date().toISOString(),
    });
    // Kill the command recorder if still running
    if (this.commandRecorder) {
      this.commandRecorder.kill('SIGKILL');
      this.commandRecorder = null;
    }
    // Transcribe whatever was captured
    this.transcribeCommand();
  }

  // ---- Error Handling ----

  private handleError(message: string): void {
    this.errorCount++;
    this.lastError = message;
    logger.error('wake-word', message);
    this.emit('error', { message });
    eventBus.emit('wake-word:error', {
      message,
      timestamp: new Date().toISOString(),
    });
    // Recover to listening state
    this.setState('listening');
    this.startListeningLoop();
  }

  // ---- Cleanup ----

  private cleanupAll(): void {
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    if (this.chunkRecorder) {
      this.chunkRecorder.kill('SIGKILL');
      this.chunkRecorder = null;
    }
    if (this.commandRecorder) {
      this.commandRecorder.kill('SIGKILL');
      this.commandRecorder = null;
    }
    if (this.commandTimeout) {
      clearTimeout(this.commandTimeout);
      this.commandTimeout = null;
    }
    // Clean up temp files
    for (const path of [this.chunkPath, this.commandPath, '/tmp/jarvis-energy-check.raw']) {
      try {
        if (existsSync(path)) unlinkSync(path);
      } catch {
        // ignore
      }
    }
  }
}

// Auto-disable if not enabled
if (!WAKE_WORD_ENABLED) {
  logger.info('wake-word', 'Wake word detection disabled (WAKE_WORD_ENABLED not set to true)');
}
