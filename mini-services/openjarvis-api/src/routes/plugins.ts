/**
 * Plugin Routes
 *
 * GET  /plugins              — list all loaded/tracked plugins
 * POST /plugins/reload       — rescan and reload all plugins
 * POST /plugins/:name/unload — unload a specific plugin by name
 */
import { Router, Request, Response } from 'express';
import { pluginService, getPluginRegistry } from '../services/pluginService.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /plugins
 * Returns the status of every plugin that has been tracked.
 */
router.get('/', (_req: Request, res: Response) => {
  const requestId = (_req as Record<string, unknown>).requestId as string || '-';
  const plugins = pluginService.getPluginStatus();

  res.json({
    plugins,
    total: plugins.length,
    loaded: plugins.filter(p => p.status === 'loaded').length,
    errors: plugins.filter(p => p.status === 'error').length,
    requestId,
  });
});

/**
 * POST /plugins/reload
 * Clears all loaded plugins, unregisters them from the ToolRegistry,
 * and re-scans the plugins directory from scratch.
 */
router.post('/reload', async (_req: Request, res: Response) => {
  const requestId = (_req as Record<string, unknown>).requestId as string || '-';

  try {
    const registry = getPluginRegistry();
    const results = await pluginService.reloadPlugins(registry);

    res.json({
      message: 'Plugins reloaded',
      results,
      loaded: results.filter(r => r.status === 'loaded').length,
      errors: results.filter(r => r.status === 'error').length,
      requestId,
    });
  } catch (err: any) {
    logger.error(requestId, `Plugin reload failed: ${err.message}`);
    res.status(500).json({
      error: {
        code: 'PLUGIN_RELOAD_FAILED',
        message: err.message,
        requestId,
      },
    });
  }
});

/**
 * POST /plugins/:name/unload
 * Unload a specific plugin by name. Removes it from both the
 * tracking map and the ToolRegistry.
 */
router.post('/:name/unload', async (req: Request, res: Response) => {
  const requestId = (req as Record<string, unknown>).requestId as string || '-';
  const { name } = req.params;

  try {
    const registry = getPluginRegistry();
    const removed = await pluginService.unloadPlugin(name, registry);

    if (!removed) {
      return res.status(404).json({
        error: {
          code: 'PLUGIN_NOT_FOUND',
          message: `Plugin '${name}' is not loaded`,
          requestId,
        },
      });
    }

    res.json({
      message: `Plugin '${name}' unloaded`,
      requestId,
    });
  } catch (err: any) {
    logger.error(requestId, `Plugin unload failed: ${err.message}`);
    res.status(500).json({
      error: {
        code: 'PLUGIN_UNLOAD_FAILED',
        message: err.message,
        requestId,
      },
    });
  }
});

export default router;
