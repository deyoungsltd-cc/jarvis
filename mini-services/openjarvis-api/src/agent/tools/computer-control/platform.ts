/**
 * Shared platform helper for nut.js hardware control.
 *
 * - Dynamically imports @nut-tree/nut-js so headless environments don't crash
 *   at module-load time.
 * - On Windows, sets required environment variables before import.
 * - Exports `requireDisplay()` which every tool calls to gate execution.
 * - Includes a minimal PNG encoder (no extra deps) for screenshot output.
 */

import { deflateSync } from 'node:zlib';

// ------------------------------------------------------------------
// Lazy-loaded nut.js sub-modules (populated on first successful import)
// ------------------------------------------------------------------
let _mouse: any = null;
let _keyboard: any = null;
let _screen: any = null;
let _clipboard: any = null;
let _window: any = null;
let _Key: any = null;

let _nutImported = false;
let _displayAvailable = false;
let _importError: string | null = null;

/**
 * Attempt to dynamically import nut.js.  Called once; result is cached.
 * Returns true when the library loaded and a display server is reachable.
 */
async function tryImportNut(): Promise<boolean> {
  if (_nutImported) return _displayAvailable;
  _nutImported = true;

  try {
    // Windows may need a little coaxing for native addon resolution
    if (process.platform === 'win32') {
      process.env.NUT_JS_NATIVE_IMAGE_DEBUG = '0';
    }

    const nut = await import('@nut-tree/nut-js');

    _mouse = nut.mouse;
    _keyboard = nut.keyboard;
    _screen = nut.screen;
    _clipboard = nut.clipboard;
    _window = nut.window;
    _Key = nut.Key;

    // Quick smoke-test: query screen size.
    // This will throw on headless Linux (no X11/Wayland).
    await nut.screen.width();
    await nut.screen.height();

    _displayAvailable = true;
    return true;
  } catch (err: any) {
    _importError = err?.message ?? String(err);
    _displayAvailable = false;
    return false;
  }
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/** Whether nut.js was successfully imported and a display is available. */
export function isDisplayAvailable(): boolean {
  return _displayAvailable;
}

/** The error message from the failed nut.js import, or null. */
export function getImportError(): string | null {
  return _importError;
}

/**
 * Call at the top of every tool's execute().  Ensures nut.js is loaded.
 * Throws a human-readable error if no display server is available.
 */
export async function requireDisplay(): Promise<void> {
  const ok = await tryImportNut();
  if (!ok) {
    throw new Error(
      `DISPLAY_UNAVAILABLE: nut.js could not initialise. ` +
        (_importError
          ? `Reason: ${_importError}`
          : 'This environment has no display server (X11/Wayland on Linux, or no active desktop session). ' +
            'Computer-control tools require a graphical desktop.')
    );
  }
}

/** Cached nut.js sub-module accessors.  Only call after requireDisplay(). */
export function getNutMouse(): any    { return _mouse; }
export function getNutKeyboard(): any { return _keyboard; }
export function getNutScreen(): any   { return _screen; }
export function getNutClipboard(): any { return _clipboard; }
export function getNutWindow(): any   { return _window; }
export function getNutKey(): any      { return _Key; }

// ------------------------------------------------------------------
// Platform helpers
// ------------------------------------------------------------------

export function isWindows(): boolean { return process.platform === 'win32'; }
export function isMac(): boolean    { return process.platform === 'darwin'; }
export function isLinux(): boolean  { return process.platform === 'linux'; }

/**
 * Resolve a key name string (e.g. "Control+a", "Enter") into nut.js Key values.
 * Supports single keys, single letters, F-keys, and +  separated combos.
 */
export function resolveKeys(keyName: string): any[] {
  const Key = _Key!;
  const parts = keyName.split('+').map((s) => s.trim());
  const keys: any[] = [];

  for (const part of parts) {
    // Direct enum lookup: "Enter" → Key.Enter
    if ((Key as any)[part] !== undefined) {
      keys.push((Key as any)[part]);
      continue;
    }

    // Single-letter key: "a" → Key.A
    if (part.length === 1 && /[a-zA-Z]/.test(part)) {
      const upper = part.toUpperCase();
      if ((Key as any)[upper] !== undefined) {
        keys.push((Key as any)[upper]);
        continue;
      }
    }

    // F(n) keys: "F1" → Key.F1
    if (/^F\d+$/i.test(part)) {
      const fName = 'F' + part.slice(1);
      if ((Key as any)[fName] !== undefined) {
        keys.push((Key as any)[fName]);
        continue;
      }
    }

    // Numeric keys: "0".."9" → Key.Num0 .. Key.Num9
    if (/^[0-9]$/.test(part)) {
      const nName = 'Num' + part;
      if ((Key as any)[nName] !== undefined) {
        keys.push((Key as any)[nName]);
        continue;
      }
    }

    throw new Error(`Unknown key: "${part}" in key combination "${keyName}"`);
  }

  return keys;
}

// ------------------------------------------------------------------
// Minimal PNG encoder (zero external deps)
// ------------------------------------------------------------------

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const _crcTable = buildCrcTable();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = _crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, 'ascii');
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])), 0);
  return Buffer.concat([len, typeB, data, crcB]);
}

/**
 * Encode raw RGBA pixel data into a valid PNG buffer.
 * Used by the screenshot tool to avoid requiring sharp/jimp at runtime.
 */
export function encodeRawRgbaToPng(
  rgba: Uint8Array,
  width: number,
  height: number,
): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrPayload = Buffer.alloc(13);
  ihdrPayload.writeUInt32BE(width, 0);
  ihdrPayload.writeUInt32BE(height, 4);
  ihdrPayload[8] = 8; // bit depth
  ihdrPayload[9] = 6; // RGBA
  const ihdr = makeChunk('IHDR', ihdrPayload);

  // IDAT — prepend filter byte 0 (None) per scanline
  const stride = 1 + width * 4;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    const srcOff = y * width * 4;
    Buffer.from(rgba).copy(raw, y * stride + 1, srcOff, srcOff + width * 4);
  }
  const compressed = deflateSync(raw);
  const idat = makeChunk('IDAT', compressed);

  // IEND
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}
