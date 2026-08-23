/*
 * MCP REST Routes — Phase 8
 *
 * /mcp/servers          — list all MCP servers
 * /mcp/servers          — create MCP server
 * /mcp/servers/:id      — get server details
 * /mcp/servers/:id      — update server config
 * /mcp/servers/:id      — delete server
 * /mcp/servers/:id/connect    — connect to server
 * /mcp/servers/:id/disconnect — disconnect from server
 * /mcp/servers/:id/tools      — list tools from a server
 * /mcp/tools            — list all MCP tools across servers
 * /mcp/status           — get overall MCP status
 */
import { Router, Request, Response, NextFunction } from 'express';
import { mcpPluginManager } from '../mcp/pluginManager.js';
import { badRequest } from '../utils/errors.js';

const router = Router();

// ---- Servers CRUD ----

/** GET /mcp/servers — list all MCP servers */
router.get('/servers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const servers = await mcpPluginManager.listServers();
    res.json(servers);
  } catch (err) { next(err); }
});

/** POST /mcp/servers — register a new MCP server */
router.post('/servers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as any).requestId as string;
    const { name, description, transport, command, args, url, env } = req.body;

    if (!name || typeof name !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'Server name is required', requestId);
    }
    if (!transport || !['stdio', 'sse', 'in-process'].includes(transport)) {
      throw badRequest('VALIDATION_ERROR', 'Transport must be stdio, sse, or in-process', requestId);
    }
    if (transport === 'stdio' && !command) {
      throw badRequest('VALIDATION_ERROR', 'stdio transport requires a command', requestId);
    }
    if (transport === 'sse' && !url) {
      throw badRequest('VALIDATION_ERROR', 'sse transport requires a url', requestId);
    }

    const server = await mcpPluginManager.createServer({
      name, description, transport,
      command, args, url, env,
    });
    res.status(201).json(server);
  } catch (err) { next(err); }
});

/** GET /mcp/servers/:id — get server details */
router.get('/servers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const server = await mcpPluginManager.getServer(req.params.id);
    res.json(server);
  } catch (err) { next(err); }
});

/** PATCH /mcp/servers/:id — update server config */
router.patch('/servers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const server = await mcpPluginManager.updateServer(req.params.id, req.body);
    res.json(server);
  } catch (err) { next(err); }
});

/** DELETE /mcp/servers/:id — delete server */
router.delete('/servers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await mcpPluginManager.deleteServer(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

// ---- Connection Lifecycle ----

/** POST /mcp/servers/:id/connect — connect to an MCP server */
router.post('/servers/:id/connect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const server = await mcpPluginManager.connectServer(req.params.id);
    res.json(server);
  } catch (err) { next(err); }
});

/** POST /mcp/servers/:id/disconnect — disconnect from an MCP server */
router.post('/servers/:id/disconnect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await mcpPluginManager.disconnectServer(req.params.id);
    res.json({ status: 'disconnected' });
  } catch (err) { next(err); }
});

// ---- Tools ----

/** GET /mcp/servers/:id/tools — list tools from a specific server */
router.get('/servers/:id/tools', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tools = await mcpPluginManager.getServerTools(req.params.id);
    res.json(tools);
  } catch (err) { next(err); }
});

/** GET /mcp/tools — list all MCP tools across all servers */
router.get('/tools', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tools = await mcpPluginManager.listTools();
    res.json(tools);
  } catch (err) { next(err); }
});

// ---- Status ----

/** GET /mcp/status — overall MCP system status */
router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await mcpPluginManager.getStatus();
    res.json(status);
  } catch (err) { next(err); }
});

export default router;
