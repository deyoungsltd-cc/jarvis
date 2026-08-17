import express from 'express';
import { requestLogger } from './src/middleware/requestLogger.js';
import { errorHandler } from './src/middleware/errorHandler.js';
import healthRoutes from './src/routes/health.js';
import missionRoutes from './src/routes/missions.js';
import toolRoutes from './src/routes/tools.js';
import memoryRoutes from './src/routes/memory.js';
import agentRoutes from './src/routes/agent.js';
import { logger } from './src/utils/logger.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = express();
app.use(express.json({ limit: '10mb' }));

// Middleware
app.use(requestLogger);

// Routes
app.use('/health', healthRoutes);
app.use('/missions', missionRoutes);
app.use('/tools', toolRoutes);
app.use('/memory', memoryRoutes);
app.use('/agent', agentRoutes);

// 404 handler
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

// Global error handler
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info('-', `OpenJarvis API listening on port ${PORT}`);
  logger.info('-', `Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('-', 'SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('-', 'SIGINT received, shutting down...');
  process.exit(0);
});
