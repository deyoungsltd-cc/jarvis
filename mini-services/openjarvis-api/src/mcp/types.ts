/*
 * MCP Types — Phase 8
 *
 * Core types for the Model Context Protocol integration.
 * Covers JSON-RPC 2.0, MCP protocol messages, server/tool config.
 */

// ---- JSON-RPC 2.0 ----

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ---- MCP Protocol Types ----

export interface McpInitializeParams {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  clientInfo: { name: string; version: string };
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: { name: string; version: string };
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpListToolsResult {
  tools: McpToolDefinition[];
}

export interface McpCallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpCallToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// ---- MCP Server Configuration ----

export type McpTransport = 'stdio' | 'sse' | 'in-process';
export type McpServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface McpServerConfig {
  name: string;
  description?: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled?: boolean;
}

// ---- Transport Interface ----

export interface McpTransportClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(request: JsonRpcRequest): Promise<JsonRpcResponse>;
  isConnected(): boolean;
}

// ---- Plugin Manager Types ----

export interface ConnectedServer {
  id: string;
  name: string;
  transport: McpTransport;
  status: McpServerStatus;
  toolCount: number;
  lastError?: string;
  connectedAt?: Date;
}

export interface McpToolInfo {
  id: string;
  serverId: string;
  serverName: string;
  name: string;       // namespaced: "mcp__servername__toolname"
  mcpName: string;   // original name from MCP server
  description: string;
  inputSchema: Record<string, unknown> | null;
  riskLevel: string;
  enabled: boolean;
}
