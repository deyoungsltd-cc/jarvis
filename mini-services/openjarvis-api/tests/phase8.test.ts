/*
 * Phase 8 Tests — MCP / Plugin System
 *
 * Tests the MCP layer directly (no HTTP server needed):
 * 1. MCP Types: valid interfaces, type guards
 * 2. In-Process Transport: connect, send (initialize, list_tools, call_tool), disconnect
 * 3. MCP Protocol Client: initialize, listTools, callTool, error handling
 * 4. Plugin Manager: server CRUD, in-process connect, tool sync, tool listing, status, buildToolHandlers
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { InProcessTransport } from '../src/mcp/transports.js';
import { McpProtocolClient, McpError } from '../src/mcp/mcpClient.js';
import { mcpPluginManager } from '../src/mcp/pluginManager.js';
import { db } from '../src/utils/db.js';

// =================================================================
// 1. MCP Types
// =================================================================

describe('Phase 8 — MCP Types', () => {
  it('defines McpTransport as a union of valid transports', () => {
    const stdio: 'stdio' = 'stdio';
    const sse: 'sse' = 'sse';
    const inp: 'in-process' = 'in-process';
    expect([stdio, sse, inp]).toHaveLength(3);
  });

  it('defines McpServerStatus as expected values', () => {
    const statuses = ['disconnected', 'connecting', 'connected', 'error'];
    for (const s of statuses) {
      expect(s).toBeTruthy();
    }
  });

  it('JSON-RPC request shape is valid', () => {
    const req = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
    };
    expect(req.jsonrpc).toBe('2.0');
    expect(req.id).toBe(1);
    expect(req.method).toBe('initialize');
  });
});

// =================================================================
// 2. In-Process Transport
// =================================================================

describe('Phase 8 — In-Process Transport', () => {
  let transport: InProcessTransport;

  beforeEach(() => {
    transport = new InProcessTransport({
      tools: [
        {
          name: 'echo',
          description: 'Echoes input',
          inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        },
        {
          name: 'add',
          description: 'Adds two numbers',
          inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] },
        },
      ],
      handlers: new Map([
        ['echo', async (args) => ({ content: [{ type: 'text', text: `Echo: ${args.text}` }] })],
        ['add', async (args) => ({ content: [{ type: 'text', text: String(Number(args.a) + Number(args.b)) }] })],
      ]),
    });
  });

  it('starts disconnected', () => {
    expect(transport.isConnected()).toBe(false);
  });

  it('connects and reports connected', async () => {
    await transport.connect();
    expect(transport.isConnected()).toBe(true);
    await transport.disconnect();
  });

  it('handles initialize request', async () => {
    await transport.connect();
    const response = await transport.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' },
    }});
    expect(response.result).toBeDefined();
    const result = response.result as any;
    expect(result.protocolVersion).toBe('2024-11-05');
    expect(result.serverInfo.name).toBe('in-process');
    await transport.disconnect();
  });

  it('handles tools/list request', async () => {
    await transport.connect();
    const response = await transport.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const result = response.result as any;
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].name).toBe('echo');
    expect(result.tools[1].name).toBe('add');
    await transport.disconnect();
  });

  it('handles tools/call request', async () => {
    await transport.connect();
    const response = await transport.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: { text: 'hello' } } });
    const result = response.result as any;
    expect(result.content[0].text).toBe('Echo: hello');
    await transport.disconnect();
  });

  it('handles tools/call with add', async () => {
    await transport.connect();
    const response = await transport.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'add', arguments: { a: 3, b: 7 } } });
    const result = response.result as any;
    expect(result.content[0].text).toBe('10');
    await transport.disconnect();
  });

  it('returns error for unknown tool', async () => {
    await transport.connect();
    const response = await transport.send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nonexistent', arguments: {} } });
    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe(-32601);
    await transport.disconnect();
  });

  it('returns error for unknown method', async () => {
    await transport.connect();
    const response = await transport.send({ jsonrpc: '2.0', id: 6, method: 'foo/bar' });
    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe(-32601);
    await transport.disconnect();
  });

  it('disconnects cleanly', async () => {
    await transport.connect();
    await transport.disconnect();
    expect(transport.isConnected()).toBe(false);
  });

  it('throws when sending while disconnected', async () => {
    await expect(transport.send({ jsonrpc: '2.0', id: 1, method: 'initialize' })).rejects.toThrow('Not connected');
  });
});

// =================================================================
// 3. MCP Protocol Client
// =================================================================

describe('Phase 8 — MCP Protocol Client', () => {
  it('initializes and stores server info', async () => {
    const transport = new InProcessTransport({
      tools: [],
      handlers: new Map(),
    });
    await transport.connect();

    const client = new McpProtocolClient(transport);
    const result = await client.initialize('test-client', '2.0.0');

    expect(result.serverInfo.name).toBe('in-process');
    expect(result.protocolVersion).toBe('2024-11-05');
    expect(client.serverInfo!.name).toBe('in-process');
    expect(client.isConnected()).toBe(true);

    await transport.disconnect();
  });

  it('lists tools via protocol client', async () => {
    const transport = new InProcessTransport({
      tools: [
        { name: 'test_tool', description: 'A test', inputSchema: { type: 'object', properties: {} } },
      ],
      handlers: new Map(),
    });
    await transport.connect();

    const client = new McpProtocolClient(transport);
    await client.initialize();

    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test_tool');

    await transport.disconnect();
  });

  it('calls tools via protocol client', async () => {
    const transport = new InProcessTransport({
      tools: [
        { name: 'greet', description: 'Greets', inputSchema: { type: 'object', properties: { name: { type: 'string' } } } },
      ],
      handlers: new Map([
        ['greet', async (args) => ({ content: [{ type: 'text', text: `Hello, ${args.name}!` }] })],
      ]),
    });
    await transport.connect();

    const client = new McpProtocolClient(transport);
    await client.initialize();

    const result = await client.callTool('greet', { name: 'World' });
    expect(result.content[0].text).toBe('Hello, World!');

    await transport.disconnect();
  });

  it('throws McpError on protocol error', async () => {
    const transport = new InProcessTransport({
      tools: [],
      handlers: new Map(),
    });
    await transport.connect();

    const client = new McpProtocolClient(transport);

    await expect(client.callTool('nonexistent', {})).rejects.toThrow(McpError);

    try {
      await client.callTool('nonexistent', {});
    } catch (err) {
      expect((err as McpError).code).toBe(-32601);
      expect((err as McpError).name).toBe('McpError');
    }

    await transport.disconnect();
  });
});

// =================================================================
// 4. Plugin Manager
// =================================================================

describe('Phase 8 — Plugin Manager', () => {
  // Clean up any MCP servers created during tests
  beforeEach(async () => {
    const servers = await db.mcpServer.findMany({ select: { id: true } });
    for (const s of servers) {
      try { await mcpPluginManager.deleteServer(s.id); } catch { /* ignore */ }
    }
  });

  // ---- Server CRUD ----
  describe('Server CRUD', () => {
    it('creates a stdio server', async () => {
      const server = await mcpPluginManager.createServer({
        name: 'test-stdio',
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
      });
      expect(server.id).toBeDefined();
      expect(server.name).toBe('test-stdio');
      expect(server.transport).toBe('stdio');
      expect(server.status).toBe('disconnected');
    });

    it('creates an sse server', async () => {
      const server = await mcpPluginManager.createServer({
        name: 'test-sse',
        transport: 'sse',
        url: 'http://localhost:8080/mcp',
      });
      expect(server.transport).toBe('sse');
    });

    it('rejects duplicate names', async () => {
      await mcpPluginManager.createServer({ name: 'dup', transport: 'in-process' });
      await expect(mcpPluginManager.createServer({ name: 'dup', transport: 'in-process' }))
        .rejects.toThrow('already exists');
    });

    it('rejects stdio without command', async () => {
      await expect(mcpPluginManager.createServer({ name: 'bad', transport: 'stdio' }))
        .rejects.toThrow('requires a command');
    });

    it('rejects sse without url', async () => {
      await expect(mcpPluginManager.createServer({ name: 'bad2', transport: 'sse' }))
        .rejects.toThrow('requires a url');
    });

    it('rejects invalid transport', async () => {
      await expect(mcpPluginManager.createServer({ name: 'bad3', transport: 'websocket' as any }))
        .rejects.toThrow('Invalid transport');
    });

    it('lists servers', async () => {
      await mcpPluginManager.createServer({ name: 's1', transport: 'in-process' });
      await mcpPluginManager.createServer({ name: 's2', transport: 'in-process' });
      const list = await mcpPluginManager.listServers();
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('gets a server by ID', async () => {
      const created = await mcpPluginManager.createServer({ name: 'get-test', transport: 'in-process' });
      const got = await mcpPluginManager.getServer(created.id);
      expect(got.id).toBe(created.id);
      expect(got.name).toBe('get-test');
    });

    it('updates a server', async () => {
      const created = await mcpPluginManager.createServer({ name: 'upd-test', transport: 'in-process' });
      const updated = await mcpPluginManager.updateServer(created.id, { description: 'Updated desc' });
      expect(updated.name).toBe('upd-test');
    });

    it('deletes a server', async () => {
      const created = await mcpPluginManager.createServer({ name: 'del-test', transport: 'in-process' });
      await mcpPluginManager.deleteServer(created.id);
      await expect(mcpPluginManager.getServer(created.id)).rejects.toThrow();
    });
  });

  // ---- In-Process Connect ----
  describe('In-Process Connect', () => {
    it('connects an in-process server with tools', async () => {
      const server = await mcpPluginManager.registerInProcess({
        name: 'test-plugin',
        description: 'A test plugin',
        tools: [
          { name: 'hello', description: 'Says hello', inputSchema: { type: 'object', properties: { name: { type: 'string' } } } },
          { name: 'calc', description: 'Calculates', inputSchema: { type: 'object', properties: { expr: { type: 'string' } } } },
        ],
        handlers: new Map([
          ['hello', async (args) => ({ content: [{ type: 'text', text: `Hello ${args.name || 'stranger'}` }] })],
          ['calc', async (args) => ({ content: [{ type: 'text', text: `Result: ${args.expr}` }] })],
        ]),
      });

      expect(server.status).toBe('connected');
      expect(server.toolCount).toBe(2);
    });

    it('synced tools have namespaced names', async () => {
      await mcpPluginManager.registerInProcess({
        name: 'ns-test',
        tools: [
          { name: 'my_tool', description: 'Test', inputSchema: { type: 'object', properties: {} } },
        ],
        handlers: new Map([
          ['my_tool', async () => ({ content: [{ type: 'text', text: 'ok' }] })],
        ]),
      });

      const tools = await mcpPluginManager.listTools();
      const found = tools.find(t => t.name === 'mcp__ns-test__my_tool');
      expect(found).toBeDefined();
      expect(found!.mcpName).toBe('my_tool');
      expect(found!.riskLevel).toBe('medium');
    });

    it('lists tools for a specific server', async () => {
      const server = await mcpPluginManager.registerInProcess({
        name: 'per-server-test',
        tools: [
          { name: 't1', description: 'Tool 1', inputSchema: { type: 'object', properties: {} } },
        ],
        handlers: new Map([
          ['t1', async () => ({ content: [{ type: 'text', text: 'ok' }] })],
        ]),
      });

      const tools = await mcpPluginManager.getServerTools(server.id);
      expect(tools).toHaveLength(1);
      expect(tools[0].mcpName).toBe('t1');
    });

    it('disconnects a connected server', async () => {
      const server = await mcpPluginManager.registerInProcess({
        name: 'disc-test',
        tools: [
          { name: 'x', description: 'X', inputSchema: { type: 'object', properties: {} } },
        ],
        handlers: new Map([
          ['x', async () => ({ content: [{ type: 'text', text: 'x' }] })],
        ]),
      });

      await mcpPluginManager.disconnectServer(server.id);
      const refreshed = await mcpPluginManager.getServer(server.id);
      expect(refreshed.status).toBe('disconnected');
    });
  });

  // ---- buildToolHandlers ----
  describe('buildToolHandlers', () => {
    it('returns ToolHandler[] for connected servers', async () => {
      await mcpPluginManager.registerInProcess({
        name: 'handler-test',
        tools: [
          { name: 'double', description: 'Doubles a number', inputSchema: { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] } },
        ],
        handlers: new Map([
          ['double', async (args) => ({ content: [{ type: 'text', text: String(Number(args.n) * 2) }] })],
        ]),
      });

      const handlers = await mcpPluginManager.buildToolHandlers();
      expect(handlers.length).toBeGreaterThanOrEqual(1);

      const handler = handlers.find(h => h.name === 'mcp__handler-test__double');
      expect(handler).toBeDefined();
      expect(handler!.riskLevel).toBe('medium');
    });

    it('executes a built-in tool handler and returns correct result', async () => {
      await mcpPluginManager.registerInProcess({
        name: 'exec-test',
        tools: [
          { name: 'triple', description: 'Triples a number', inputSchema: { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] } },
        ],
        handlers: new Map([
          ['triple', async (args) => ({ content: [{ type: 'text', text: String(Number(args.n) * 3) }] })],
        ]),
      });

      const handlers = await mcpPluginManager.buildToolHandlers();
      const handler = handlers.find(h => h.name === 'mcp__exec-test__triple')!;

      const result = await handler.execute({ n: 5 });
      expect(result.success).toBe(true);
      expect(result.output).toContain('15');
    });

    it('handles tool errors gracefully', async () => {
      await mcpPluginManager.registerInProcess({
        name: 'err-test',
        tools: [
          { name: 'fail', description: 'Always fails', inputSchema: { type: 'object', properties: {} } },
        ],
        handlers: new Map([
          ['fail', async () => ({ content: [{ type: 'text', text: 'error occurred' }], isError: true })],
        ]),
      });

      const handlers = await mcpPluginManager.buildToolHandlers();
      const handler = handlers.find(h => h.name === 'mcp__err-test__fail')!;

      const result = await handler.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ---- Status ----
  describe('Status', () => {
    it('returns correct status counts', async () => {
      await mcpPluginManager.registerInProcess({
        name: 'status-test',
        tools: [
          { name: 'a', description: 'A', inputSchema: { type: 'object', properties: {} } },
          { name: 'b', description: 'B', inputSchema: { type: 'object', properties: {} } },
        ],
        handlers: new Map([
          ['a', async () => ({ content: [{ type: 'text', text: 'a' }] })],
          ['b', async () => ({ content: [{ type: 'text', text: 'b' }] })],
        ]),
      });

      const status = await mcpPluginManager.getStatus();
      expect(status.totalServers).toBeGreaterThanOrEqual(1);
      expect(status.connected).toBeGreaterThanOrEqual(1);
      expect(status.totalMcpTools).toBeGreaterThanOrEqual(2);
    });
  });

  // ---- McpError ----
  describe('McpError', () => {
    it('has correct properties', () => {
      const err = new McpError(-32601, 'Method not found', { method: 'foo' });
      expect(err.name).toBe('McpError');
      expect(err.code).toBe(-32601);
      expect(err.message).toBe('Method not found');
      expect(err.data).toEqual({ method: 'foo' });
      expect(err).toBeInstanceOf(Error);
    });
  });
});
