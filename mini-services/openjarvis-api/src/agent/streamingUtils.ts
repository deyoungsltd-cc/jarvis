/**
 * Streaming utilities for SSE (Server-Sent Events) responses.
 * 
 * Provides helpers to:
 *   - Set up SSE headers on an Express Response
 *   - Simulate streaming from a full text response
 *   - Pipe an AsyncGenerator to an SSE response
 */
import { Response } from 'express';
import { StreamChunk } from './types.js';

/**
 * Configure an Express response for SSE.
 * Sets the correct headers and disables buffering.
 */
export function createSSEStream(res: Response): Response {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();
  return res;
}

/**
 * Send a single SSE event.
 */
function sendSSEEvent(res: Response, data: unknown): boolean {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false; // Client disconnected
  }
}

/**
 * Simulate streaming by breaking full text into word-level chunks.
 * Yields StreamChunk objects suitable for SSE piping.
 *
 * @param text - The full text to simulate streaming for
 * @param chunkSize - Number of characters per chunk (default: 3 words)
 */
export async function* simulateStream(
  text: string,
  chunkSize: number = 3,
): AsyncGenerator<StreamChunk> {
  if (!text) return;

  // Split into words, preserving whitespace as separate tokens
  const words = text.split(/(\s+)/);
  let buffer = '';
  let wordCount = 0;

  for (const word of words) {
    buffer += word;
    // Only count non-whitespace tokens
    if (word.trim().length > 0) {
      wordCount++;
    }

    if (wordCount >= chunkSize) {
      yield { type: 'chunk', data: { text: buffer } };
      buffer = '';
      wordCount = 0;
    }
  }

  // Yield any remaining text
  if (buffer) {
    yield { type: 'chunk', data: { text: buffer } };
  }
}

/**
 * Pipe an AsyncGenerator of StreamChunks to an SSE response.
 * Handles errors, client disconnection, and ensures cleanup.
 *
 * @param generator - The async generator yielding StreamChunks
 * @param res - Express response (must have SSE headers already set)
 */
export async function streamToSSE(
  generator: AsyncGenerator<StreamChunk>,
  res: Response,
): Promise<void> {
  try {
    for await (const chunk of generator) {
      // Check if client is still connected
      if (res.writableEnded || res.destroyed) {
        break;
      }

      // Map chunk types to SSE event format
      switch (chunk.type) {
        case 'chunk':
          sendSSEEvent(res, { type: 'chunk', text: chunk.data?.text || '' });
          break;
        case 'tool_call':
          sendSSEEvent(res, { type: 'tool_call', ...chunk.data });
          break;
        case 'done':
          sendSSEEvent(res, { type: 'done', usage: chunk.data?.usage, finishReason: chunk.data?.finishReason });
          break;
        case 'error':
          sendSSEEvent(res, { type: 'error', message: chunk.data?.message || 'Unknown streaming error' });
          break;
        default:
          sendSSEEvent(res, { type: chunk.type, ...chunk.data });
      }
    }
  } catch (err: any) {
    // Generator threw — send error event if client still connected
    if (!res.writableEnded && !res.destroyed) {
      sendSSEEvent(res, { type: 'error', message: err.message || 'Stream generator error' });
    }
  } finally {
    // Ensure the stream is properly terminated
    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  }
}
