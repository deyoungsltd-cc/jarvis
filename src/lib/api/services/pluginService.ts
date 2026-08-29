/**
 * Plugin Service
 *
 * Loads tool plugins from a `plugins/` directory, dynamically imports each
 * `.js` file, validates the manifest, and registers the plugin as a tool
 * in the shared ToolRegistry.
 *
 * Plugin contract (each .js file must export default):
 *   {
 *     name:          string,
 *     description:   string,
 *     inputSchema:   object,   // JSON Schema
 *     outputSchema:  object,   // JSON Schema
 *     riskLevel:     'low' | 'medium' | 'high' | 'critical',
 *     execute:       async (input) => ToolExecutionResult
 *   }
 */
import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ToolRegistry } from '@/lib/api/agent/toolRegistry.js';
import { ToolHandler, ToolExecutionResult } from '@/lib/api/agent/types.js';
import { logger } from '@/lib/api/logger';

// ---- Types ----

interface PluginManifest {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  execute: (input: Record<string, unknown>) => Promise<ToolExecutionResult>;
}

export interface PluginStatus {
  name: string;
  filePath: string;
  status: 'loaded' | 'error';
  error?: string;
}

// ---- Constants ----

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_PLUGINS_DIR = path.join(PROJECT_ROOT, 'plugins');
const PLUGIN_EXTENSIONS = new Set(['.js']);
const VALID_RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical']);

// ---- Shared Registry ----

/** Shared ToolRegistry instance for all loaded plugins */
const pluginRegistry = new ToolRegistry();

/** Access the shared plugin ToolRegistry */
export function getPluginRegistry(): ToolRegistry {
  return pluginRegistry;
}

// ---- PluginService ----

class PluginService {
  private pluginsDir: string;
  /** filePath → status tracking */
  private loadedPlugins: Map<string, PluginStatus> = new Map();
  /** name → filePath reverse index for fast unload lookup */
  private nameToPath: Map<string, string> = new Map();

  constructor(pluginsDir?: string) {
    this.pluginsDir = pluginsDir || DEFAULT_PLUGINS_DIR;
  }

  // ---- Public API ----

  /**
   * Scan the plugins directory, import every `.js` file, validate,
   * and register each plugin in the ToolRegistry.
   * Returns an array of status objects (one per file found).
   */
  async loadPlugins(registry?: ToolRegistry): Promise<PluginStatus[]> {
    const targetRegistry = registry || pluginRegistry;
    const results: PluginStatus[] = [];

    // 1. Discover plugin files
    let files: string[];
    try {
      const entries = await readdir(this.pluginsDir);
      files = entries.filter(f => PLUGIN_EXTENSIONS.has(path.extname(f).toLowerCase()));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        logger.warn('pluginService', `Plugins directory not found: ${this.pluginsDir}`);
        return [];
      }
      throw err;
    }

    // 2. Load each plugin file
    for (const file of files) {
      const filePath = path.resolve(this.pluginsDir, file);
      try {
        await this.loadSinglePlugin(filePath, targetRegistry);
        const status = this.loadedPlugins.get(filePath);
        if (status) results.push(status);
      } catch (err: any) {
        const status: PluginStatus = {
          name: path.basename(file, path.extname(file)),
          filePath,
          status: 'error',
          error: String(err.message || err),
        };
        this.loadedPlugins.set(filePath, status);
        results.push(status);
        logger.error('pluginService', `Failed to load plugin ${file}: ${status.error}`);
      }
    }

    logger.info(
      'pluginService',
      `Loaded ${results.filter(r => r.status === 'loaded').length}/${results.length} plugins from ${this.pluginsDir}`,
    );
    return results;
  }

  /**
   * Clear all tracked plugins (and their registrations in the ToolRegistry),
   * then re-scan the plugins directory from scratch.
   */
  async reloadPlugins(registry?: ToolRegistry): Promise<PluginStatus[]> {
    const targetRegistry = registry || pluginRegistry;

    // Unregister every currently loaded plugin from the registry
    for (const [filePath, status] of this.loadedPlugins) {
      if (status.status === 'loaded') {
        try {
          targetRegistry.unregister(status.name);
        } catch {
          // Ignore — may have already been removed
        }
      }
    }

    this.loadedPlugins.clear();
    this.nameToPath.clear();

    return this.loadPlugins(targetRegistry);
  }

  /**
   * Return the status of every plugin that has been tracked
   * (loaded or errored) since the last load/reload.
   */
  getPluginStatus(): PluginStatus[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Unload a specific plugin by name.
   * Removes it from the tracking map AND from the ToolRegistry.
   * Returns `true` if the plugin was found and removed.
   */
  async unloadPlugin(name: string, registry?: ToolRegistry): Promise<boolean> {
    const targetRegistry = registry || pluginRegistry;
    const filePath = this.nameToPath.get(name);
    if (!filePath) return false;

    const status = this.loadedPlugins.get(filePath);
    if (status && status.status === 'loaded') {
      try {
        targetRegistry.unregister(name);
      } catch {
        // ToolRegistry.unregister may throw if not found — ignore
      }
      logger.info('pluginService', `Plugin '${name}' unregistered from ToolRegistry`);
    }

    this.loadedPlugins.delete(filePath);
    this.nameToPath.delete(name);
    logger.info('pluginService', `Plugin '${name}' unloaded`);
    return true;
  }

  // ---- Private helpers ----

  /**
   * Dynamically import a single plugin file, validate its manifest,
   * wrap it as a ToolHandler, and register it.
   */
  private async loadSinglePlugin(filePath: string, registry: ToolRegistry): Promise<void> {
    const modulePath = `file://${filePath}`;
    const pluginModule: any = await import(modulePath);

    // Support both default and named exports
    const plugin: PluginManifest = pluginModule.default || pluginModule.plugin || pluginModule;

    this.validateManifest(plugin);

    // Build a ToolHandler from the plugin manifest
    const handler: ToolHandler = {
      name: plugin.name,
      description: plugin.description,
      inputSchema: plugin.inputSchema,
      outputSchema: plugin.outputSchema,
      riskLevel: plugin.riskLevel,
      capability: 'plugin',
      execute: plugin.execute,
    };

    // Register in the shared ToolRegistry
    try {
      registry.register(handler);
    } catch (err: any) {
      throw new Error(`Registration failed: ${err.message}`);
    }

    // Track the plugin
    const status: PluginStatus = { name: plugin.name, filePath, status: 'loaded' };
    this.loadedPlugins.set(filePath, status);
    this.nameToPath.set(plugin.name, filePath);

    logger.info('pluginService', `Plugin '${plugin.name}' loaded from ${path.basename(filePath)}`);
  }

  /** Validate that a plugin object conforms to the required manifest shape. */
  private validateManifest(plugin: any): void {
    if (!plugin || typeof plugin !== 'object') {
      throw new Error('Plugin must export an object');
    }
    if (typeof plugin.name !== 'string' || !plugin.name.trim()) {
      throw new Error('Plugin must have a non-empty string "name"');
    }
    if (typeof plugin.description !== 'string') {
      throw new Error('Plugin must have a string "description"');
    }
    if (!plugin.inputSchema || typeof plugin.inputSchema !== 'object') {
      throw new Error('Plugin must have an "inputSchema" object');
    }
    if (!plugin.outputSchema || typeof plugin.outputSchema !== 'object') {
      throw new Error('Plugin must have an "outputSchema" object');
    }
    if (!VALID_RISK_LEVELS.has(plugin.riskLevel)) {
      throw new Error('Plugin must have a valid "riskLevel" (low, medium, high, critical)');
    }
    if (typeof plugin.execute !== 'function') {
      throw new Error('Plugin must have an "execute" function');
    }
  }
}

// ---- Singleton export ----

export const pluginService = new PluginService();
