import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { requestLogger } from './src/middleware/requestLogger.js';
import { errorHandler } from './src/middleware/errorHandler.js';
import { rateLimit } from './src/middleware/rateLimiter.js';
import { validateConfig } from './src/utils/configValidator.js';
import healthRoutes from './src/routes/health.js';
import missionRoutes from './src/routes/missions.js';
import toolRoutes from './src/routes/tools.js';
import memoryRoutes from './src/routes/memory.js';
import agentRoutes from './src/routes/agent.js';
import permissionRoutes from './src/routes/permissions.js';
import voiceRoutes from './src/routes/voice.js';
import mobileRoutes from './src/routes/mobile.js';
import mobileAdminRoutes from './src/routes/mobileAdmin.js';
import mcpRoutes from './src/routes/mcp.js';
import approvalRoutes from './src/routes/approval.js';
import capabilityRoutes from './src/routes/capabilities.js';
import serviceRoutes from './src/routes/services.js';
import localLlmRoutes from './src/routes/localLlm.js';
import documentRoutes from './src/routes/documents.js';
import schedulerRoutes from './src/routes/scheduler.js';
import webhookRoutes from './src/routes/webhooks.js';
import pluginRoutes from './src/routes/plugins.js';
import vaultRoutes from './src/routes/vault.js';
import authRoutes from './src/routes/auth.js';
import { logger } from './src/utils/logger.js';
import { setSocketIO } from './src/utils/eventBus.js';
import { pluginService, getPluginRegistry } from './src/services/pluginService.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '3002', 10);

// ---- Express HTTP Server ----
const app = express();
app.use(express.json({ limit: '10mb' }));

app.use(requestLogger);

// Global rate limiter (100 req/min per IP)
app.use(rateLimit());

app.use('/health', healthRoutes);
app.use('/missions', missionRoutes);
app.use('/tools', toolRoutes);
app.use('/memory', memoryRoutes);
app.use('/agent', agentRoutes);
app.use('/permissions', permissionRoutes);
app.use('/voice', voiceRoutes);
app.use('/mobile/v1', mobileRoutes);
app.use('/mobile/admin', mobileAdminRoutes);
app.use('/mcp', mcpRoutes);
app.use('/approvals', approvalRoutes);
app.use('/capabilities', capabilityRoutes);
app.use('/services', serviceRoutes);
app.use('/agent/local-llm', localLlmRoutes);
app.use('/documents', documentRoutes);
app.use('/scheduler', schedulerRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/plugins', pluginRoutes);
app.use('/vault', vaultRoutes);
app.use('/auth', authRoutes);

app.use((_req, res) => {
  const requestId = (_req as Record<string, unknown>).requestId as string || '-';
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${_req.method} ${_req.originalUrl} not found`,
      requestId,
    },
  });
});

app.use(errorHandler);

// ---- Socket.IO WebSocket Server (separate port) ----
const httpServer = createServer();
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Wire the event bus so missionEventService broadcasts via this Socket.IO instance
setSocketIO(io);

io.on('connection', (socket) => {
  logger.info('-', `WebSocket client connected: ${socket.id}`);

  socket.on('subscribe:mission', (missionId: string) => {
    socket.join(`mission:${missionId}`);
    logger.info('-', `Socket ${socket.id} subscribed to mission ${missionId}`);
  });

  socket.on('unsubscribe:mission', (missionId: string) => {
    socket.leave(`mission:${missionId}`);
  });

  // Phase 5: Voice session subscriptions
  socket.on('subscribe:voice', (sessionId: string) => {
    socket.join(`voice:${sessionId}`);
    logger.info('-', `Socket ${socket.id} subscribed to voice session ${sessionId}`);
  });

  socket.on('unsubscribe:voice', (sessionId: string) => {
    socket.leave(`voice:${sessionId}`);
  });

  // Phase 5: Browser-relayed voice transcript
  socket.on('voice:transcript', (data: { sessionId: string; text: string; confidence?: number; direction?: 'user' | 'agent' }) => {
    const { sessionId, text, confidence, direction } = data;
    if (!sessionId || !text) return;

    // Broadcast to all clients subscribed to this voice session
    io.to(`voice:${sessionId}`).emit('voice:transcript', {
      sessionId,
      text,
      confidence,
      direction: direction || 'user',
      timestamp: new Date().toISOString(),
    });

    logger.info('voice:ws', `Transcript relayed: ${direction || 'user'}: "${text.substring(0, 60)}"`);
  });

  // Phase 5: Voice session status updates
  socket.on('voice:status', (data: { sessionId: string; status: string }) => {
    const { sessionId, status } = data;
    if (!sessionId || !status) return;

    io.to(`voice:${sessionId}`).emit('voice:status', {
      sessionId,
      status,
      timestamp: new Date().toISOString(),
    });
  });

  // Phase 10: Approval request subscriptions
  socket.on('subscribe:approvals', () => {
    socket.join('approvals:all');
    logger.info('-', `Socket ${socket.id} subscribed to approval events`);
  });

  socket.on('unsubscribe:approvals', () => {
    socket.leave('approvals:all');
  });

  socket.on('subscribe:mission:approvals', (missionId: string) => {
    socket.join(`approvals:mission:${missionId}`);
    logger.info('-', `Socket ${socket.id} subscribed to approvals for mission ${missionId}`);
  });

  // Phase 16: Service lifecycle subscriptions
  socket.on('subscribe:services', () => {
    socket.join('services:all');
    logger.info('-', `Socket ${socket.id} subscribed to service events`);
  });

  socket.on('unsubscribe:services', () => {
    socket.leave('services:all');
  });

  // Wake word event subscriptions
  socket.on('subscribe:wake-word', () => {
    socket.join('wake-word:all');
    logger.info('-', `Socket ${socket.id} subscribed to wake word events`);
  });

  socket.on('unsubscribe:wake-word', () => {
    socket.leave('wake-word:all');
  });

  socket.on('unsubscribe:mission:approvals', (missionId: string) => {
    socket.leave(`approvals:mission:${missionId}`);
  });

  socket.on('disconnect', () => {
    logger.info('-', `WebSocket client disconnected: ${socket.id}`);
  });

  socket.on('error', (err) => {
    logger.error('-', `Socket error (${socket.id}): ${err}`);
  });
});

// Start both servers
app.listen(PORT, '0.0.0.0', async () => {
  logger.info('-', `OpenJarvis API listening on port ${PORT}`);
  logger.info('-', `Health check: http://localhost:${PORT}/health`);

  // Validate configuration on startup
  const configResult = validateConfig();
  if (configResult.errors.length > 0) {
    logger.error('-', `Config validation errors (${configResult.errors.length}):`);
    for (const e of configResult.errors) logger.error('-', `  - ${e}`);
  }
  if (configResult.warnings.length > 0) {
    logger.warn('-', `Config warnings (${configResult.warnings.length}):`);
    for (const w of configResult.warnings) logger.warn('-', `  - ${w}`);
  }
  if (configResult.valid) {
    logger.info('-', 'Config validation passed');
  }

  // Auto-load plugins on startup
  try {
    const registry = getPluginRegistry();
    const results = await pluginService.loadPlugins(registry);
    const loaded = results.filter(r => r.status === 'loaded').length;
    const errors = results.filter(r => r.status === 'error').length;
    logger.info('-', `Plugins initialised: ${loaded} loaded, ${errors} errors`);
  } catch (err: any) {
    logger.error('-', `Plugin auto-load failed: ${err.message}`);
  }
});

httpServer.listen(WS_PORT, '0.0.0.0', () => {
  logger.info('-', `OpenJarvis WebSocket listening on port ${WS_PORT}`);
});

process.on('SIGTERM', () => {
  logger.info('-', 'SIGTERM received, shutting down...');
  httpServer.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('-', 'SIGINT received, shutting down...');
  httpServer.close();
  process.exit(0);
});
