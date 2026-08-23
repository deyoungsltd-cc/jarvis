/*
 * MCP Plugin Manager — Phase 8
 *
 * Manages MCP server lifecycle:
 *  - Register/unregister servers (DB-backed)
 *  - Connect/disconnect with transport creation
 *  - Tool synchronization: discover MCP tools, create namespaced ToolHandlers
 *  - Bridge MCP tools into the existing ToolRegistry
 */
import { db } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { McpProtocolClient, McpError } from './mcpClient.js';
import { StdioTransport, SseTransport, InProcessTransport } from './transports.js';
import type {
  McpServerConfig,
  McpTransport,
  McpServerStatus,
  McpToolDefinition,
  McpToolInfo,
  ConnectedServer,
} from './types.js';
import type { ToolHandler, ToolExecutionResult } from '../agent/types.js';

// Active client connections (in-memory)
const activeClients = new Map<string, McpProtocolClient>();

function mcpToolName(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`;
}

export const mcpPluginManager = {
  // =================================================================
  // Server CRUD
  // =================================================================

  async createServer(config: McpServerConfig): Promise<ConnectedServer> {
    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Server name is required');
    }
    if (!['stdio', 'sse', 'in-process'].includes(config.transport)) {
      throw new Error(`Invalid transport: ${config.transport}. Must be stdio, sse, or in-process`);
    }
    if (config.transport === 'stdio' && !config.command) {
      throw new Error('stdio transport requires a command');
    }
    if (config.transport === 'sse' && !config.url) {
      throw new Error('sse transport requires a url');
    }

    const existing = await db.mcpServer.findUnique({ where: { name: config.name } });
    if (existing) {
      throw new Error(`MCP server '${config.name}' already exists`);
    }

    const server = await db.mcpServer.create({
      data: {
        name: config.name,
        description: config.description || null,
        transport: config.transport,
        command: config.command || null,
        args: config.args ? JSON.stringify(config.args) : null,
        url: config.url || null,
        env: config.env ? JSON.stringify(config.env) : null,
        status: 'disconnected',
      },
    });

    logger.info('-', `MCP server registered: ${config.name} (${config.transport})`);
    return this._toConnectedServer(server);
  },

  async listServers(): Promise<ConnectedServer[]> {
    const servers = await db.mcpServer.findMany({ orderBy: { createdAt: 'desc' } });
    return servers.map(s => this._toConnectedServer(s));
  },

  async getServer(id: string): Promise<ConnectedServer> {
    const server = await db.mcpServer.findUnique({ where: { id } });
    if (!server) throw new Error(`MCP server not found: ${id}`);
    return this._toConnectedServer(server);
  },

  async updateServer(id: string, updates: Partial<McpServerConfig>): Promise<ConnectedServer> {
    const server = await db.mcpServer.findUnique({ where: { id } });
    if (!server) throw new Error(`MCP server not found: ${id}`);

    // If connected, disconnect first
    if (activeClients.has(id)) {
      await this.disconnectServer(id);
    }

    const data: Record<string, unknown> = {};
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.command !== undefined) data.command = updates.command;
    if (updates.args !== undefined) data.args = JSON.stringify(updates.args);
    if (updates.url !== undefined) data.url = updates.url;
    if (updates.env !== undefined) data.env = JSON.stringify(updates.env);
    if (updates.enabled !== undefined) data.enabled = updates.enabled;

    const updated = await db.mcpServer.update({ where: { id }, data });
    return this._toConnectedServer(updated);
  },

  async deleteServer(id: string): Promise<void> {
    if (activeClients.has(id)) {
      await this.disconnectServer(id);
    }
    await db.mcpServer.delete({ where: { id } });
    logger.info('-', `MCP server deleted: ${id}`);
  },

  // =================================================================
  // Connection Lifecycle
  // =================================================================

  async connectServer(id: string): Promise<ConnectedServer> {
    const server = await db.mcpServer.findUnique({ where: { id } });
    if (!server) throw new Error(`MCP server not found: ${id}`);
    if (!server.enabled) throw new Error(`MCP server '${server.name}' is disabled`);

    // Already connected?
    if (activeClients.has(id)) {
      return this._toConnectedServer(server);
    }

    // Update status to connecting
    await db.mcpServer.update({
      where: { id },
      data: { status: 'connecting', lastError: null },
    });

    try {
      // Create transport
      const transport = this._createTransport(server);
      await transport.connect();

      // Create protocol client and initialize
      const client = new McpProtocolClient(transport);
      const initResult = await client.initialize();
      logger.info('-', `MCP connected to ${server.name}: ${initResult.serverInfo.name} v${initResult.serverInfo.version}`);

      // Store active client
      activeClients.set(id, client);

      // Discover and sync tools
      const mcpTools = await client.listTools();
      await this._syncTools(id, server.name, mcpTools);

      // Update status
      const updated = await db.mcpServer.update({
        where: { id },
        data: {
          status: 'connected',
          toolCount: mcpTools.length,
          connectedAt: new Date(),
        },
      });

      return this._toConnectedServer(updated);
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      await db.mcpServer.update({
        where: { id },
        data: { status: 'error', lastError: errorMsg },
      });
      activeClients.delete(id);
      throw new Error(`Failed to connect MCP server '${server.name}': ${errorMsg}`);
    }
  },

  async disconnectServer(id: string): Promise<void> {
    const client = activeClients.get(id);
    if (client) {
      try {
        await client.isConnected() && (await this._createTransportForClient(client).disconnect());
      } catch {
        // best effort
      }
      activeClients.delete(id);
    }

    try {
      await db.mcpServer.update({
        where: { id },
        data: { status: 'disconnected', connectedAt: null },
      });
    } catch {
      // server may already be deleted
    }

    logger.info('-', `MCP server disconnected: ${id}`);
  },

  // =================================================================
  // Tool Management
  // =================================================================

  /** Get all MCP tools (from DB) */
  async listTools(serverId?: string): Promise<McpToolInfo[]> {
    const where = serverId ? { serverId } : {};
    const tools = await db.mcpTool.findMany({ where, orderBy: { createdAt: 'asc' } });
    return tools.map(t => ({
      id: t.id,
      serverId: t.serverId,
      serverName: '', // filled by join if needed
      name: t.name,
      mcpName: t.mcpName,
      description: t.description || '',
      inputSchema: t.inputSchema ? JSON.parse(t.inputSchema) : null,
      riskLevel: t.riskLevel,
      enabled: t.enabled,
    }));
  },

  /** Get tools for a specific server */
  async getServerTools(serverId: string): Promise<McpToolInfo[]> {
    return this.listTools(serverId);
  },

  /** Build ToolHandler[] from all connected MCP servers — for injection into ToolRegistry */
  async buildToolHandlers(): Promise<ToolHandler[]> {
    const servers = await db.mcpServer.findMany({
      where: { status: 'connected', enabled: true },
      include: { tools: { where: { enabled: true } } },
    });

    const handlers: ToolHandler[] = [];

    for (const server of servers) {
      const client = activeClients.get(server.id);
      if (!client) continue;

      for (const tool of server.tools) {
        const serverName = server.name;
        handlers.push({
          name: tool.name,
          description: tool.description || `MCP tool: ${tool.mcpName} (from ${serverName})`,
          inputSchema: tool.inputSchema ? JSON.parse(tool.inputSchema) : { type: 'object', properties: {} },
          outputSchema: { type: 'object', properties: { content: { type: 'array' } } },
          riskLevel: (tool.riskLevel as 'low' | 'medium' | 'high' | 'critical') || 'medium',
          execute: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
            try {
              const result = await client.callTool(tool.mcpName, input);
              // Extract text content from MCP response
              const textParts = (result.content || [])
                .filter(c => c.type === 'text')
                .map(c => c.text || '')
                .join('\n');
              return {
                success: !result.isError,
                output: textParts || result,
                error: result.isError ? 'MCP tool returned error' : undefined,
                durationMs: 0,
              };
            } catch (err: any) {
              return {
                success: false,
                output: null,
                error: `MCP tool error: ${err.message}`,
                durationMs: 0,
              };
            }
          },
        });
      }
    }

    return handlers;
  },

  // =================================================================
  // Status
  // =================================================================

  async getStatus(): Promise<{ totalServers: number; connected: number; error: number; totalMcpTools: number }> {
    const [total, connected, error, toolCount] = await Promise.all([
      db.mcpServer.count(),
      db.mcpServer.count({ where: { status: 'connected' } }),
      db.mcpServer.count({ where: { status: 'error' } }),
      db.mcpTool.count({ where: { enabled: true } }),
    ]);
    return { totalServers: total, connected, error, totalMcpTools: toolCount };
  },

  /** Call a specific MCP tool directly */
  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const client = activeClients.get(serverId);
    if (!client) throw new Error(`MCP server ${serverId} is not connected`);
    return client.callTool(toolName, args);
  },

  // =================================================================
  // Internal
  // =================================================================

  _createTransport(server: { transport: string; command?: string | null; args?: string | null; url?: string | null; env?: string | null }) {
    switch (server.transport) {
      case 'stdio':
        return new StdioTransport(
          server.command!,
          server.args ? JSON.parse(server.args) : [],
          server.env ? JSON.parse(server.env) : {},
        );
      case 'sse':
        return new SseTransport(server.url!);
      case 'in-process':
        // In-process needs special setup — not auto-created from DB config
        return new InProcessTransport({ tools: [], handlers: new Map() });
      default:
        throw new Error(`Unknown transport: ${server.transport}`);
    }
  },

  _createTransportForClient(_client: McpProtocolClient) {
    // For disconnect, we'd need to track the transport. Best effort.
    return { disconnect: async () => {} } as any;
  },

  async _syncTools(serverId: string, serverName: string, mcpTools: McpToolDefinition[]): Promise<void> {
    // Delete old tools for this server
    await db.mcpTool.deleteMany({ where: { serverId } });

    // Create new tool records
    for (const tool of mcpTools) {
      const namespacedName = mcpToolName(serverName, tool.name);
      await db.mcpTool.create({
        data: {
          serverId,
          name: namespacedName,
          mcpName: tool.name,
          description: tool.description || null,
          inputSchema: JSON.stringify(tool.inputSchema || { type: 'object', properties: {} }),
          riskLevel: 'medium', // default for external tools
        },
      });
    }

    logger.info('-', `Synced ${mcpTools.length} tools from MCP server ${serverName}`);
  },

  _toConnectedServer(server: any): ConnectedServer {
    return {
      id: server.id,
      name: server.name,
      transport: server.transport,
      status: server.status,
      toolCount: server.toolCount,
      lastError: server.lastError || undefined,
      connectedAt: server.connectedAt || undefined,
    };
  },

  // =================================================================
  // In-Process Plugin Registration (for testing)
  // =================================================================

  /** Register an in-process MCP server with tools and handlers */
  async registerInProcess(config: {
    name: string;
    description?: string;
    tools: McpToolDefinition[];
    handlers: Map<string, (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>>;
  }): Promise<ConnectedServer> {
    // Create DB record
    const server = await this.createServer({
      name: config.name,
      description: config.description,
      transport: 'in-process',
    });

    // Create transport and connect
    const transport = new InProcessTransport({
      tools: config.tools,
      handlers: new Map(config.handlers) as any,
    });
    await transport.connect();

    const client = new McpProtocolClient(transport);
    await client.initialize();

    activeClients.set(server.id, client);

    // Sync tools
    await this._syncTools(server.id, config.name, config.tools);

    await db.mcpServer.update({
      where: { id: server.id },
      data: {
        status: 'connected',
        toolCount: config.tools.length,
        connectedAt: new Date(),
      },
    });

    return this.getServer(server.id);
  },
};
