/**
 * Phase 16 — Service Lifecycle Tools
 *
 * Six new tools for the ToolRegistry that let JARVIS manage
 * all deployed Docker services through the same authorization
 * model as every other tool.
 *
 * Risk tiering:
 *   - deploy_service: medium (creates infrastructure)
 *   - update_service: medium (staged, auto-rollback)
 *   - restart_service: low (preserves data)
 *   - backup_service: low (read-only, additive)
 *   - check_service_health: low (read-only, no side effects)
 *   - rollback_service: high (reverts to previous state)
 *
 * IMPORTANT: Destructive actions (volume deletion, force-recreate
 * with data loss) are NOT exposed as tools. They can only be done
 * via direct admin action, never via "always allow" grants.
 */
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { serviceManager } from '../../../services/serviceManager.js';

// =================================================================
// deploy_service
// =================================================================

export function createDeployServiceTool(): ToolHandler {
  return {
    name: 'deploy_service',
    description: 'Deploy a Docker service from the Sovereign Stack. Starts the service container(s) using docker compose. Requires the service to be registered in the service catalog.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name (e.g. "immich", "vaultwarden", "searxng")' },
      },
      required: ['service'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        status: { type: 'string' },
        hostname: { type: 'string' },
      },
    },
    riskLevel: 'medium',
    capability: 'service_deploy',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const start = Date.now();
      try {
        const serviceName = String(input.service);
        const result = await serviceManager.deploy(serviceName);
        return {
          success: true,
          output: {
            name: result.name,
            status: result.status,
            hostname: result.hostname,
            displayName: result.displayName,
            port: result.port,
            mobileApp: result.mobileApp,
          },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return { success: false, output: null, error: String(err.message || err), durationMs: Date.now() - start };
      }
    },
  };
}

// =================================================================
// update_service
// =================================================================

export function createUpdateServiceTool(): ToolHandler {
  return {
    name: 'update_service',
    description: 'Update a running service to a new version. Uses staged update: pull new image, health-check, apply, re-verify. Automatically rolls back on failure.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name to update' },
        newImageTag: { type: 'string', description: 'Optional: specific image tag to update to (default: latest from catalog)' },
      },
      required: ['service'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        status: { type: 'string' },
        deployedImageTag: { type: 'string' },
        previousImageTag: { type: 'string' },
      },
    },
    riskLevel: 'medium',
    capability: 'service_update',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const start = Date.now();
      try {
        const serviceName = String(input.service);
        const newTag = input.newImageTag ? String(input.newImageTag) : undefined;
        const result = await serviceManager.update(serviceName, { newImageTag: newTag });
        return {
          success: true,
          output: {
            name: result.name,
            status: result.status,
            deployedImageTag: result.deployedImageTag,
            rollbackImageTag: result.rollbackImageTag,
          },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return { success: false, output: null, error: String(err.message || err), durationMs: Date.now() - start };
      }
    },
  };
}

// =================================================================
// restart_service
// =================================================================

export function createRestartServiceTool(): ToolHandler {
  return {
    name: 'restart_service',
    description: 'Restart a running service. Preserves all data and volumes. Runs a health check after restart.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name to restart' },
      },
      required: ['service'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        status: { type: 'string' },
        healthStatus: { type: 'string' },
      },
    },
    riskLevel: 'low',
    capability: 'service_restart',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const start = Date.now();
      try {
        const serviceName = String(input.service);
        const result = await serviceManager.restart(serviceName);
        return {
          success: true,
          output: { name: result.name, status: result.status, healthStatus: result.healthStatus },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return { success: false, output: null, error: String(err.message || err), durationMs: Date.now() - start };
      }
    },
  };
}

// =================================================================
// backup_service
// =================================================================

export function createBackupServiceTool(): ToolHandler {
  return {
    name: 'backup_service',
    description: 'Create a backup of a service\'s Docker volumes. Read-only, additive operation — does not modify the running service. Critical services (Vaultwarden, Nextcloud) should be backed up daily.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name to back up' },
        scheduleType: { type: 'string', enum: ['manual', 'daily', 'weekly'], description: 'Backup schedule type (default: manual)' },
      },
      required: ['service'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string' },
        filename: { type: 'string' },
        sizeBytes: { type: 'number' },
        filePath: { type: 'string' },
      },
    },
    riskLevel: 'low',
    capability: 'service_backup',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const start = Date.now();
      try {
        const serviceName = String(input.service);
        const scheduleType = (input.scheduleType as 'manual' | 'daily' | 'weekly') || 'manual';
        const result = await serviceManager.backup(serviceName, { scheduleType });
        return {
          success: true,
          output: {
            service: result.serviceName,
            filename: result.filename,
            sizeBytes: result.sizeBytes,
            filePath: result.filePath,
          },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return { success: false, output: null, error: String(err.message || err), durationMs: Date.now() - start };
      }
    },
  };
}

// =================================================================
// check_service_health
// =================================================================

export function createCheckServiceHealthTool(): ToolHandler {
  return {
    name: 'check_service_health',
    description: 'Check the health status of a deployed service. Uses Docker inspect and optional HTTP health endpoints. Read-only, no side effects.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name to check' },
      },
      required: ['service'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string' },
        healthy: { type: 'boolean' },
        status: { type: 'string' },
        responseTimeMs: { type: 'number' },
      },
    },
    riskLevel: 'low',
    capability: 'service_health_check',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const start = Date.now();
      try {
        const serviceName = String(input.service);
        const result = await serviceManager.checkHealth(serviceName);
        return {
          success: true,
          output: result,
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return { success: false, output: null, error: String(err.message || err), durationMs: Date.now() - start };
      }
    },
  };
}

// =================================================================
// rollback_service
// =================================================================

export function createRollbackServiceTool(): ToolHandler {
  return {
    name: 'rollback_service',
    description: 'Roll back a service to its previous known-good version. Only available if the service was previously updated and has a rollback image tag.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name to roll back' },
      },
      required: ['service'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        status: { type: 'string' },
        deployedImageTag: { type: 'string' },
      },
    },
    riskLevel: 'high',
    capability: 'service_rollback',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const start = Date.now();
      try {
        const serviceName = String(input.service);
        const result = await serviceManager.rollback(serviceName);
        return {
          success: true,
          output: {
            name: result.name,
            status: result.status,
            deployedImageTag: result.deployedImageTag,
          },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return { success: false, output: null, error: String(err.message || err), durationMs: Date.now() - start };
      }
    },
  };
}

// =================================================================
// Barrel export
// =================================================================

export function createAllServiceLifecycleTools(): ToolHandler[] {
  return [
    createDeployServiceTool(),
    createUpdateServiceTool(),
    createRestartServiceTool(),
    createBackupServiceTool(),
    createCheckServiceHealthTool(),
    createRollbackServiceTool(),
  ];
}
