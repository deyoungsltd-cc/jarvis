/*
 * MCP Transports — Phase 8
 *
 * Three transport implementations:
 * 1. StdioTransport — spawns child process, communicates via stdin/stdout
 * 2. SseTransport — connects to HTTP SSE endpoint, uses POST for messages
 * 3. InProcessTransport — bridges an in-process tool collection (for testing/built-in)
 */
import { ChildProcess, spawn } from 'child_process';
import type { JsonRpcRequest, JsonRpcResponse, McpToolDefinition, McpCallToolResult, McpTransportClient } from './types.js';
import { logger } from '../utils/logger.js';

// =================================================================
// Stdio Transport
// =================================================================

export class StdioTransport implements McpTransportClient {
  private proc: ChildProcess | null = null;
  private pending = new Map<number, { resolve: (v: JsonRpcResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private buffer = '';
  private _connected = false;
  private command: string;
  private args: string[];
  private env: Record<string, string>;

  constructor(command: string, args: string[] = [], env: Record<string, string> = {}) {
    this.command = command;
    this.args = args;
    this.env = env;
  }

  async connect(): Promise<void> {
    if (this._connected) return;

    return new Promise((resolve, reject) => {
      const procEnv = { ...process.env, ...this.env };
      this.proc = spawn(this.command, this.args, {
        env: procEnv as Record<string, string>,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timeout = setTimeout(() => {
        reject(new Error(`Stdio transport connect timed out for ${this.command}`));
        this.cleanup();
      }, 10000);

      this.proc.stdout?.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString();
        this.processBuffer();
      });

      this.proc.stderr?.on('data', (chunk: Buffer) => {
        logger.warn('mcp:stdio', `stderr from ${this.command}: ${chunk.toString().trim()}`);
      });

      this.proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn ${this.command}: ${err.message}`));
      });

      this.proc.on('exit', (code) => {
        if (!this._connected) {
          clearTimeout(timeout);
          reject(new Error(`Process ${this.command} exited with code ${code} before connection`));
        } else {
          this._connected = false;
          // Reject all pending
          for (const [, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(new Error('Process exited'));
          }
          this.pending.clear();
        }
      });

      // Give the process a moment to start
      setTimeout(() => {
        this._connected = true;
        clearTimeout(timeout);
        resolve();
      }, 500);
    });
  }

  async disconnect(): Promise<void> {
    this.cleanup();
  }

  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.proc || !this.proc.stdin) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Request ${request.method} timed out`));
      }, 30000);

      this.pending.set(request.id, { resolve, reject, timer });
      this.proc!.stdin!.write(JSON.stringify(request) + '\n');
    });
  }

  isConnected(): boolean { return this._connected; }

  private processBuffer() {
    // Split by newlines, each line is a JSON-RPC message
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const pending = this.pending.get(msg.id)!;
          clearTimeout(pending.timer);
          this.pending.delete(msg.id);
          pending.resolve(msg);
        }
      } catch {
        // Not valid JSON, skip
      }
    }
  }

  private cleanup() {
    this._connected = false;
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Disconnected'));
    }
    this.pending.clear();
    this.buffer = '';
  }
}

// =================================================================
// SSE Transport
// =================================================================

export class SseTransport implements McpTransportClient {
  private _connected = false;
  private url: string;
  private sessionId: string | null = null;
  private messageEndpoint: string | null = null;
  private pending = new Map<number, { resolve: (v: JsonRpcResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(url: string) {
    this.url = url.replace(/\/+$/, '');
  }

  async connect(): Promise<void> {
    if (this._connected) return;

    // SSE connect: GET the SSE endpoint to establish stream and get session ID
    try {
      const response = await fetch(`${this.url}/sse`);
      if (!response.ok) {
        throw new Error(`SSE connect failed: HTTP ${response.status}`);
      }

      // Parse the endpoint from the SSE stream
      // The server sends an "endpoint" event with the POST URL
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      // Read first few events to get the endpoint
      for (let i = 0; i < 10; i++) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: endpoint')) {
            // Next data line has the URL
            continue;
          }
          if (line.startsWith('data: ') && !this.messageEndpoint) {
            const data = line.slice(6).trim();
            if (data.startsWith('http')) {
              this.messageEndpoint = data;
              this.sessionId = new URL(data).searchParams.get('sessionId') || null;
            }
          }
        }

        if (this.messageEndpoint) break;
      }

      reader.releaseLock();

      if (!this.messageEndpoint) {
        throw new Error('SSE server did not provide message endpoint');
      }

      this._connected = true;
    } catch (err: any) {
      throw new Error(`SSE transport connect failed: ${err.message}`);
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this.messageEndpoint = null;
    this.sessionId = null;
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Disconnected'));
    }
    this.pending.clear();
  }

  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this._connected || !this.messageEndpoint) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Request ${request.method} timed out`));
      }, 30000);

      this.pending.set(request.id, { resolve, reject, timer });

      fetch(this.messageEndpoint!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }).then(async (res) => {
        const json = await res.json() as JsonRpcResponse;
        const pending = this.pending.get(json.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(json.id);
          pending.resolve(json);
        }
      }).catch((err) => {
        const pending = this.pending.get(request.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(request.id);
          pending.reject(err);
        }
      });
    });
  }

  isConnected(): boolean { return this._connected; }
}

// =================================================================
// In-Process Transport (for testing & built-in plugins)
// =================================================================

export class InProcessTransport implements McpTransportClient {
  private _connected = false;
  private tools: McpToolDefinition[];
  private handlers: Map<string, (args: Record<string, unknown>) => Promise<McpCallToolResult>>;

  constructor(config: {
    tools: McpToolDefinition[];
    handlers: Map<string, (args: Record<string, unknown>) => Promise<McpCallToolResult>>;
  }) {
    this.tools = config.tools;
    this.handlers = config.handlers;
  }

  async connect(): Promise<void> {
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this._connected) throw new Error('Not connected');

    switch (request.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0', id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            serverInfo: { name: 'in-process', version: '1.0.0' },
          },
        } as JsonRpcResponse;

      case 'tools/list':
        return {
          jsonrpc: '2.0', id: request.id,
          result: { tools: this.tools },
        } as JsonRpcResponse;

      case 'tools/call': {
        const name = request.params?.name as string;
        const args = (request.params?.arguments || {}) as Record<string, unknown>;
        const handler = this.handlers.get(name);
        if (!handler) {
          return {
            jsonrpc: '2.0', id: request.id,
            error: { code: -32601, message: `Tool '${name}' not found` },
          };
        }
        try {
          const result = await handler(args);
          return { jsonrpc: '2.0', id: request.id, result } as JsonRpcResponse;
        } catch (err: any) {
          return {
            jsonrpc: '2.0', id: request.id,
            error: { code: -32000, message: err.message },
          };
        }
      }

      case 'notifications/initialized':
        return { jsonrpc: '2.0', id: request.id, result: {} } as JsonRpcResponse;

      default:
        return {
          jsonrpc: '2.0', id: request.id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        };
    }
  }

  isConnected(): boolean { return this._connected; }
}
