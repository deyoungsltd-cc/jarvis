/*
 * MCP Protocol Client — Phase 8
 *
 * Implements JSON-RPC 2.0 over a transport abstraction.
 * Provides initialize, listTools, and callTool methods.
 */
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpTransportClient,
  McpInitializeResult,
  McpToolDefinition,
  McpCallToolResult,
} from '@/lib/api/types.js';
import { logger } from '@/lib/api/logger';

export class McpProtocolClient {
  private requestId = 0;
  private transport: McpTransportClient;
  private _serverInfo: McpInitializeResult['serverInfo'] | null = null;
  private _protocolVersion: string | null = null;

  constructor(transport: McpTransportClient) {
    this.transport = transport;
  }

  get serverInfo() { return this._serverInfo; }
  get protocolVersion() { return this._protocolVersion; }

  /** Send a JSON-RPC request and get a typed response */
  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    };

    const response = await this.transport.send(request);

    if (response.error) {
      throw new McpError(
        response.error.code,
        response.error.message,
        response.error.data,
      );
    }

    return response.result as T;
  }

  /** Initialize the MCP connection */
  async initialize(clientName: string = 'openjarvis', clientVersion: string = '1.0.0'): Promise<McpInitializeResult> {
    const result = await this.send<McpInitializeResult>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: clientName, version: clientVersion },
    });

    this._serverInfo = result.serverInfo;
    this._protocolVersion = result.protocolVersion;

    // Send initialized notification (no id = notification)
    await this.transport.send({
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'notifications/initialized',
    });

    return result;
  }

  /** List all available tools from the MCP server */
  async listTools(): Promise<McpToolDefinition[]> {
    const result = await this.send<{ tools: McpToolDefinition[] }>('tools/list');
    return result.tools || [];
  }

  /** Call a tool on the MCP server */
  async callTool(name: string, args?: Record<string, unknown>): Promise<McpCallToolResult> {
    return this.send<McpCallToolResult>('tools/call', {
      name,
      arguments: args,
    });
  }

  /** Check if the transport is connected */
  isConnected(): boolean {
    return this.transport.isConnected();
  }
}

/** Custom error for MCP protocol errors */
export class McpError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'McpError';
  }
}