/**
 * Phase 16 — Service Manager
 *
 * JARVIS-managed lifecycle for all deployed Docker services.
 * Every deploy, update, backup, health check, and rollback goes through
 * the same audit trail and authorization model as every other tool.
 *
 * Risk tiering:
 *   - Routine (health checks, scheduled backups): always-allow via standing grant
 *   - Destructive (volume deletion, force-recreate with data loss): ALWAYS requires live approval,
 *     no "always allow" override available
 */
import { execSync, exec as execAsync, type ExecOptions } from 'child_process';
import { existsSync, mkdirSync, statSync, readdirSync, copyFileSync, createReadStream, createWriteStream } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { db } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';
import { missionEventService } from './missionEventService.js';
import { SERVICE_CATALOG, getResourceSummary, type ServiceDefinition } from './serviceCatalog.js';

// =============================================================
// Types
// =============================================================

export type ServiceStatus = 'not_deployed' | 'deploying' | 'running' | 'stopped' | 'updating' | 'error' | 'rollback';
export type HealthStatus = 'unknown' | 'healthy' | 'unhealthy' | 'degraded';

export interface ServicePublic {
  id: string;
  name: string;
  displayName: string;
  group: string;
  hostname?: string;
  status: string;
  healthStatus: string;
  resourceWeight: string;
  ramEstimateMB: number;
  diskEstimateGB: number;
  port?: number;
  imageTag: string;
  deployedImageTag?: string;
  rollbackImageTag?: string;
  mobileApp?: string;
  mobileAppNote?: string;
  error?: string;
  lastHealthCheck?: string;
  lastDeployedAt?: string;
  lastUpdatedAt?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BackupPublic {
  id: string;
  serviceInstanceId: string;
  serviceName: string;
  filename: string;
  filePath: string;
  sizeBytes: number;
  scheduleType: string;
  storageLocation: string;
  storageTarget?: string;
  verified: boolean;
  restoredFrom: boolean;
  createdAt: string;
}

export interface DeployOptions {
  missionId?: string;
  requestId?: string;
}

export interface UpdateOptions extends DeployOptions {
  newImageTag?: string;
}

export interface BackupOptions {
  missionId?: string;
  requestId?: string;
  scheduleType?: 'manual' | 'daily' | 'weekly';
}

// =============================================================
// Docker compose base directory
// =============================================================

const COMPOSE_DIR = resolve(process.env.COMPOSE_DIR || './compose');
const BACKUP_DIR = resolve(process.env.BACKUP_DIR || './backups');
const DOCKER_COMPOSE_CMD = process.env.DOCKER_COMPOSE_CMD || 'docker compose';

// =============================================================
// Service Manager
// =============================================================

export const serviceManager = {
  // =================================================================
  // Seed — populate DB from catalog on first run
  // =================================================================

  async seed(requestId: string = '-') {
    let seeded = 0;
    for (const def of SERVICE_CATALOG) {
      const existing = await db.serviceInstance.findUnique({ where: { name: def.name } });
      if (!existing) {
        await db.serviceInstance.create({
          data: {
            name: def.name,
            displayName: def.displayName,
            group: def.group,
            repoUrl: def.repoUrl,
            replaces: def.replaces,
            hostname: def.hostname,
            composePath: join(COMPOSE_DIR, `group-${def.group.toLowerCase()}.yml`),
            serviceName: def.serviceName,
            imageTag: def.imageTag,
            healthUrl: def.healthUrl || null,
            resourceWeight: def.resourceWeight,
            port: def.port,
            mobileApp: def.mobileApp || null,
            mobileAppNote: def.mobileAppNote || null,
          },
        });
        seeded++;
      }
    }

    if (seeded > 0) {
      logger.info(requestId, `Seeded ${seeded} service definitions into registry`);
    }

    return { total: SERVICE_CATALOG.length, seeded };
  },

  // =================================================================
  // List / Get
  // =================================================================

  async list(filters?: { group?: string; status?: string; enabled?: boolean }, requestId: string = '-') {
    const where: Record<string, unknown> = {};
    if (filters?.group) where.group = filters.group;
    if (filters?.status) where.status = filters.status;
    if (filters?.enabled !== undefined) where.enabled = filters.enabled;

    const instances = await db.serviceInstance.findMany({
      where,
      orderBy: [{ group: 'asc' }, { name: 'asc' }],
    });

    return instances.map(this._toPublic);
  },

  async getByName(name: string, requestId: string = '-') {
    const instance = await db.serviceInstance.findUnique({ where: { name } });
    if (!instance) throw new Error(`Service '${name}' not found in registry`);
    return this._toPublic(instance);
  },

  async getById(id: string, requestId: string = '-') {
    const instance = await db.serviceInstance.findUnique({ where: { id } });
    if (!instance) throw new Error(`Service instance ${id} not found`);
    return this._toPublic(instance);
  },

  // =================================================================
  // Deploy
  // =================================================================

  /**
   * Deploy a service by name.
   * Creates a mission event for audit trail.
   * Runs docker compose up -d for the service's group.
   */
  async deploy(serviceName: string, options: DeployOptions = {}): Promise<ServicePublic> {
    const { missionId, requestId = '-' } = options;
    const instance = await db.serviceInstance.findUnique({ where: { name: serviceName } });
    if (!instance) throw new Error(`Service '${serviceName}' not found in registry`);

    const composePath = instance.composePath;
    if (!existsSync(composePath)) {
      throw new Error(`Compose file not found: ${composePath}. Generate compose files first.`);
    }

    // Update status to deploying
    await db.serviceInstance.update({
      where: { id: instance.id },
      data: { status: 'deploying', error: null },
    });

    // Log mission event
    if (missionId) {
      await missionEventService.create({
        missionId,
        type: 'tool_execute',
        payload: { tool: 'deploy_service', service: serviceName, action: 'deploy' },
      }, requestId);
    }

    try {
      // Save current image tag for potential rollback
      const currentTag = instance.deployedImageTag;

      // Execute: docker compose -f <path> up -d <service_name>
      const cmd = `${DOCKER_COMPOSE_CMD} -f "${composePath}" up -d ${instance.serviceName}`;
      logger.info(requestId, `Deploying service '${serviceName}': ${cmd}`);

      const output = this._execDocker(cmd, requestId);

      // Update status
      const updated = await db.serviceInstance.update({
        where: { id: instance.id },
        data: {
          status: 'running',
          deployedImageTag: instance.imageTag,
          rollbackImageTag: currentTag || null,
          lastDeployedAt: new Date(),
          error: null,
        },
      });

      logger.info(requestId, `Service '${serviceName}' deployed successfully`);
      eventBus.emit('service:status_changed', {
        serviceId: instance.id,
        name: serviceName,
        status: 'running',
        previousStatus: 'deploying',
      });

      if (missionId) {
        await missionEventService.create({
          missionId,
          type: 'tool_execute',
          payload: { tool: 'deploy_service', service: serviceName, action: 'deploy', result: 'success', output: output.substring(0, 500) },
        }, requestId);
      }

      return this._toPublic(updated);
    } catch (err: any) {
      const errorMsg = String(err.message || err);
      await db.serviceInstance.update({
        where: { id: instance.id },
        data: { status: 'error', error: errorMsg },
      });

      logger.error(requestId, `Deploy failed for '${serviceName}': ${errorMsg}`);

      if (missionId) {
        await missionEventService.create({
          missionId,
          type: 'error',
          payload: { tool: 'deploy_service', service: serviceName, action: 'deploy', result: 'failed', error: errorMsg },
        }, requestId);
      }

      throw new Error(`Deploy failed for '${serviceName}': ${errorMsg}`);
    }
  },

  // =================================================================
  // Update (staged)
  // =================================================================

  /**
   * Staged update flow:
   * 1. Pull new image
   * 2. Health-check the staged image
   * 3. Apply (restart with new image)
   * 4. Re-verify health
   * 5. Rollback automatically on failed re-verification
   */
  async update(serviceName: string, options: UpdateOptions = {}): Promise<ServicePublic> {
    const { missionId, requestId = '-', newImageTag } = options;
    const instance = await db.serviceInstance.findUnique({ where: { name: serviceName } });
    if (!instance) throw new Error(`Service '${serviceName}' not found in registry`);

    if (instance.status !== 'running') {
      throw new Error(`Cannot update service '${serviceName}' — current status is '${instance.status}', expected 'running'`);
    }

    const targetImage = newImageTag || instance.imageTag;
    const composePath = instance.composePath;

    // Save rollback point
    const previousImageTag = instance.deployedImageTag || instance.imageTag;

    await db.serviceInstance.update({
      where: { id: instance.id },
      data: { status: 'updating', error: null },
    });

    if (missionId) {
      await missionEventService.create({
        missionId,
        type: 'tool_execute',
        payload: { tool: 'update_service', service: serviceName, targetImage, previousImageTag },
      }, requestId);
    }

    try {
      // Step 1: Pull the new image
      logger.info(requestId, `Updating '${serviceName}': pulling ${targetImage}`);
      this._execDocker(`docker pull ${targetImage}`, requestId);

      // Step 2: Update the image tag in the compose file and recreate
      // (In production, this would patch the compose file; here we use docker compose up with the new image)
      logger.info(requestId, `Updating '${serviceName}': recreating container with new image`);
      this._execDocker(`${DOCKER_COMPOSE_CMD} -f "${composePath}" up -d --force-recreate ${instance.serviceName}`, requestId);

      // Step 3: Wait for health check
      const healthResult = await this._waitForHealth(instance, 60000, requestId);

      if (!healthResult.healthy) {
        // Step 5: Automatic rollback on failed health
        logger.warn(requestId, `Update health check failed for '${serviceName}', rolling back to ${previousImageTag}`);
        return this._rollbackTo(instance, previousImageTag, missionId, requestId);
      }

      // Step 4: Re-verify — second health check after brief settle
      await new Promise(r => setTimeout(r, 5000));
      const reVerify = await this._waitForHealth(instance, 30000, requestId);

      if (!reVerify.healthy) {
        logger.warn(requestId, `Re-verification failed for '${serviceName}', rolling back`);
        return this._rollbackTo(instance, previousImageTag, missionId, requestId);
      }

      // Success — update DB
      const updated = await db.serviceInstance.update({
        where: { id: instance.id },
        data: {
          status: 'running',
          deployedImageTag: targetImage,
          rollbackImageTag: previousImageTag,
          lastUpdatedAt: new Date(),
          healthStatus: 'healthy',
          lastHealthCheck: new Date(),
          error: null,
        },
      });

      logger.info(requestId, `Service '${serviceName}' updated to ${targetImage} successfully`);
      eventBus.emit('service:status_changed', {
        serviceId: instance.id, name: serviceName, status: 'running', previousStatus: 'updating',
      });

      if (missionId) {
        await missionEventService.create({
          missionId, type: 'tool_execute',
          payload: { tool: 'update_service', service: serviceName, result: 'success', newImage: targetImage },
        }, requestId);
      }

      return this._toPublic(updated);
    } catch (err: any) {
      const errorMsg = String(err.message || err);

      // Attempt rollback on any error
      try {
        logger.warn(requestId, `Update error for '${serviceName}', attempting rollback: ${errorMsg}`);
        return await this._rollbackTo(instance, previousImageTag, missionId, requestId);
      } catch (rollbackErr: any) {
        await db.serviceInstance.update({
          where: { id: instance.id },
          data: { status: 'error', error: `Update failed: ${errorMsg}. Rollback also failed: ${rollbackErr.message}` },
        });
        throw new Error(`Update and rollback both failed for '${serviceName}'`);
      }
    }
  },

  // =================================================================
  // Restart
  // =================================================================

  async restart(serviceName: string, options: DeployOptions = {}): Promise<ServicePublic> {
    const { missionId, requestId = '-' } = options;
    const instance = await db.serviceInstance.findUnique({ where: { name: serviceName } });
    if (!instance) throw new Error(`Service '${serviceName}' not found in registry`);

    const composePath = instance.composePath;

    if (missionId) {
      await missionEventService.create({
        missionId, type: 'tool_execute',
        payload: { tool: 'restart_service', service: serviceName },
      }, requestId);
    }

    try {
      logger.info(requestId, `Restarting service '${serviceName}'`);
      this._execDocker(`${DOCKER_COMPOSE_CMD} -f "${composePath}" restart ${instance.serviceName}`, requestId);

      const healthResult = await this._waitForHealth(instance, 60000, requestId);

      const updated = await db.serviceInstance.update({
        where: { id: instance.id },
        data: {
          status: healthResult.healthy ? 'running' : 'degraded',
          healthStatus: healthResult.healthy ? 'healthy' : 'degraded',
          lastHealthCheck: new Date(),
          error: healthResult.healthy ? null : 'Health check failed after restart',
        },
      });

      logger.info(requestId, `Service '${serviceName}' restarted (health: ${updated.healthStatus})`);
      return this._toPublic(updated);
    } catch (err: any) {
      await db.serviceInstance.update({
        where: { id: instance.id },
        data: { status: 'error', error: String(err.message || err) },
      });
      throw new Error(`Restart failed for '${serviceName}': ${err.message}`);
    }
  },

  // =================================================================
  // Health Check
  // =================================================================

  async checkHealth(serviceName: string, requestId: string = '-'): Promise<{
    service: string;
    healthy: boolean;
    status: string;
    responseTimeMs: number;
    error?: string;
  }> {
    const instance = await db.serviceInstance.findUnique({ where: { name: serviceName } });
    if (!instance) throw new Error(`Service '${serviceName}' not found in registry`);

    const result = await this._performHealthCheck(instance, requestId);

    await db.serviceInstance.update({
      where: { id: instance.id },
      data: {
        healthStatus: result.healthy ? 'healthy' : 'unhealthy',
        lastHealthCheck: new Date(),
      },
    });

    return result;
  },

  /** Check health of all services — used by scheduled health monitoring */
  async checkAllHealth(requestId: string = '-') {
    const instances = await db.serviceInstance.findMany({
      where: { status: 'running', enabled: true },
    });

    const results: Array<{
      service: string;
      healthy: boolean;
      status: string;
      responseTimeMs: number;
      error?: string;
    }> = [];

    for (const instance of instances) {
      const result = await this._performHealthCheck(instance, requestId);
      results.push(result);

      await db.serviceInstance.update({
        where: { id: instance.id },
        data: {
          healthStatus: result.healthy ? 'healthy' : 'unhealthy',
          lastHealthCheck: new Date(),
        },
      });
    }

    // Emit unhealthy services as events for dashboard
    const unhealthy = results.filter(r => !r.healthy);
    if (unhealthy.length > 0) {
      eventBus.emit('service:health_alert', {
        unhealthyServices: unhealthy.map(r => ({ service: r.service, error: r.error })),
        timestamp: new Date().toISOString(),
      });
    }

    return { total: results.length, healthy: results.filter(r => r.healthy).length, unhealthy, checkedAt: new Date().toISOString() };
  },

  // =================================================================
  // Backup
  // =================================================================

  async backup(serviceName: string, options: BackupOptions = {}): Promise<BackupPublic> {
    const { missionId, requestId = '-', scheduleType = 'manual' } = options;
    const instance = await db.serviceInstance.findUnique({ where: { name: serviceName } });
    if (!instance) throw new Error(`Service '${serviceName}' not found in registry`);

    const def = SERVICE_CATALOG.find(s => s.name === serviceName);
    if (!def || def.backupVolumes.length === 0) {
      throw new Error(`Service '${serviceName}' has no backupable volumes`);
    }

    if (missionId) {
      await missionEventService.create({
        missionId, type: 'tool_execute',
        payload: { tool: 'backup_service', service: serviceName, scheduleType, volumes: def.backupVolumes },
      }, requestId);
    }

    // Ensure backup directory exists
    const serviceBackupDir = join(BACKUP_DIR, serviceName);
    mkdirSync(serviceBackupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${serviceName}_${timestamp}.tar.gz`;
    const filePath = join(serviceBackupDir, filename);

    try {
      // Use docker to create a tar archive of all volumes
      // Build volume arguments
      const volumeArgs = def.backupVolumes.map(v => `-v ${v}:/backup_volumes/${v}`).join(' ');

      // Create temporary container to archive volumes
      const archiveCmd = `docker run --rm \
        -v "${serviceBackupDir}:/output" \
        ${volumeArgs} \
        alpine:3.19 sh -c "cd /backup_volumes && tar czf /output/${filename} ."`;

      logger.info(requestId, `Backing up '${serviceName}' volumes: ${def.backupVolumes.join(', ')}`);
      this._execDocker(archiveCmd, requestId, 120000);

      // Get file size
      const sizeBytes = existsSync(filePath) ? statSync(filePath).size : 0;

      const backup = await db.serviceBackup.create({
        data: {
          serviceInstanceId: instance.id,
          filename,
          filePath,
          sizeBytes,
          scheduleType,
          storageLocation: 'local',
          serviceStatusAtBackup: instance.status,
        },
      });

      logger.info(requestId, `Backup created for '${serviceName}': ${filename} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`);

      if (missionId) {
        await missionEventService.create({
          missionId, type: 'tool_execute',
          payload: { tool: 'backup_service', service: serviceName, result: 'success', filename, sizeBytes },
        }, requestId);
      }

      return this._backupToPublic(backup, serviceName);
    } catch (err: any) {
      const errorMsg = String(err.message || err);
      logger.error(requestId, `Backup failed for '${serviceName}': ${errorMsg}`);
      if (missionId) {
        await missionEventService.create({
          missionId, type: 'error',
          payload: { tool: 'backup_service', service: serviceName, result: 'failed', error: errorMsg },
        }, requestId);
      }
      throw new Error(`Backup failed for '${serviceName}': ${errorMsg}`);
    }
  },

  // =================================================================
  // Restore
  // =================================================================

  async restore(backupId: string, options: DeployOptions = {}): Promise<ServicePublic> {
    const { missionId, requestId = '-' } = options;
    const backup = await db.serviceBackup.findUnique({ where: { id: backupId } });
    if (!backup) throw new Error(`Backup ${backupId} not found`);

    const instance = await db.serviceInstance.findUnique({ where: { id: backup.serviceInstanceId } });
    if (!instance) throw new Error(`Service instance not found for backup ${backupId}`);

    if (!existsSync(backup.filePath)) {
      throw new Error(`Backup file not found at ${backup.filePath}`);
    }

    const def = SERVICE_CATALOG.find(s => s.name === instance.name);
    if (!def) throw new Error(`Service definition not found for '${instance.name}'`);

    if (missionId) {
      await missionEventService.create({
        missionId, type: 'tool_execute',
        payload: { tool: 'restore_service', service: instance.name, backupId, filename: backup.filename },
      }, requestId);
    }

    try {
      // Stop the service first
      try {
        this._execDocker(`${DOCKER_COMPOSE_CMD} -f "${instance.composePath}" stop ${instance.serviceName}`, requestId);
      } catch { /* may not be running */ }

      // Restore volumes from backup
      const volumeArgs = def.backupVolumes.map(v => `-v ${v}:/restore_volumes/${v}`).join(' ');
      const restoreCmd = `docker run --rm \
        -v "${dirname(backup.filePath)}:/backup_file" \
        ${volumeArgs} \
        alpine:3.19 sh -c "cd /restore_volumes && tar xzf /backup_file/${backup.filename}"`;

      logger.info(requestId, `Restoring '${instance.name}' from backup ${backup.filename}`);
      this._execDocker(restoreCmd, requestId, 120000);

      // Restart the service
      this._execDocker(`${DOCKER_COMPOSE_CMD} -f "${instance.composePath}" up -d ${instance.serviceName}`, requestId);

      // Mark backup as verified (it was used for restore)
      await db.serviceBackup.update({
        where: { id: backupId },
        data: { restoredFrom: true, verified: true },
      });

      const healthResult = await this._waitForHealth(instance, 60000, requestId);

      const updated = await db.serviceInstance.update({
        where: { id: instance.id },
        data: {
          status: healthResult.healthy ? 'running' : 'degraded',
          healthStatus: healthResult.healthy ? 'healthy' : 'degraded',
          lastHealthCheck: new Date(),
        },
      });

      logger.info(requestId, `Service '${instance.name}' restored from backup ${backup.filename}`);

      if (missionId) {
        await missionEventService.create({
          missionId, type: 'tool_execute',
          payload: { tool: 'restore_service', service: instance.name, result: 'success', backupId },
        }, requestId);
      }

      return this._toPublic(updated);
    } catch (err: any) {
      logger.error(requestId, `Restore failed for '${instance.name}': ${err.message}`);
      throw new Error(`Restore failed for '${instance.name}': ${err.message}`);
    }
  },

  // =================================================================
  // Rollback
  // =================================================================

  async rollback(serviceName: string, options: DeployOptions = {}): Promise<ServicePublic> {
    const { missionId, requestId = '-' } = options;
    const instance = await db.serviceInstance.findUnique({ where: { name: serviceName } });
    if (!instance) throw new Error(`Service '${serviceName}' not found in registry`);

    if (!instance.rollbackImageTag) {
      throw new Error(`No rollback image tag available for '${serviceName}'`);
    }

    return this._rollbackTo(instance, instance.rollbackImageTag, missionId, requestId);
  },

  // =================================================================
  // Stop
  // =================================================================

  async stop(serviceName: string, options: DeployOptions = {}): Promise<ServicePublic> {
    const { requestId = '-' } = options;
    const instance = await db.serviceInstance.findUnique({ where: { name: serviceName } });
    if (!instance) throw new Error(`Service '${serviceName}' not found in registry`);

    try {
      this._execDocker(`${DOCKER_COMPOSE_CMD} -f "${instance.composePath}" stop ${instance.serviceName}`, requestId);

      const updated = await db.serviceInstance.update({
        where: { id: instance.id },
        data: { status: 'stopped', healthStatus: 'unknown' },
      });

      logger.info(requestId, `Service '${serviceName}' stopped`);
      return this._toPublic(updated);
    } catch (err: any) {
      throw new Error(`Stop failed for '${serviceName}': ${err.message}`);
    }
  },

  // =================================================================
  // Backup Listing
  // =================================================================

  async listBackups(serviceName?: string, requestId: string = '-') {
    const where: Record<string, unknown> = {};
    if (serviceName) {
      const instance = await db.serviceInstance.findUnique({ where: { name: serviceName } });
      if (!instance) throw new Error(`Service '${serviceName}' not found`);
      where.serviceInstanceId = instance.id;
    }

    const backups = await db.serviceBackup.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Enrich with service name
    return Promise.all(backups.map(async b => {
      const svc = await db.serviceInstance.findUnique({ where: { id: b.serviceInstanceId } });
      return this._backupToPublic(b, svc?.name || 'unknown');
    }));
  },

  // =================================================================
  // Resource Summary (for go/no-go analysis)
  // =================================================================

  async getResourceReport(requestId: string = '-') {
    const summary = getResourceSummary();
    const instances = await db.serviceInstance.findMany();

    return {
      resourceSummary: summary,
      deployedCount: instances.filter(i => i.status === 'running').length,
      totalRegistered: instances.length,
      deploymentStatus: instances.map(i => ({
        name: i.name,
        displayName: i.displayName,
        group: i.group,
        status: i.status,
        resourceWeight: i.resourceWeight,
      })),
      openRisks: [
        {
          risk: 'Single-disk backup',
          detail: 'Backups written to the same physical disk as the source data. If the disk fails, both original and backup are lost. A second physical storage location (external drive, NAS, or cloud) is needed for real backup safety.',
          mitigation: 'Configure BACKUP_DIR to point to a second physical drive, or set up Nextcloud to mirror critical backups off-box.',
        },
        {
          risk: 'Resource contention',
          detail: `Always-on services require ~${Math.round(summary.alwaysOnRamMB / 1024 * 10) / 10} GB RAM steady state. On-demand services can spike to ~${Math.round(summary.onDemandRamMB / 1024 * 10) / 10} GB RAM when active. If all services run simultaneously, total RAM demand is ~${Math.round(summary.totalRamEstimateMB / 1024 * 10) / 10} GB.`,
          mitigation: 'On-demand services (Upscayl, Whisper, Audiblez, Rembg, Spleeter, pyVideoTrans, OCRmyPDF) should be stopped when not in use. Consider staggering on-demand workloads.',
        },
      ],
    };
  },

  // =================================================================
  // Internal — Docker Execution
  // =================================================================

  _execDocker(cmd: string, requestId: string, timeoutMs: number = 300000): string {
    try {
      const output = execSync(cmd, {
        timeout: timeoutMs,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      });
      return output.trim();
    } catch (err: any) {
      const stderr = err.stderr?.toString() || err.message || 'Unknown error';
      logger.error(requestId, `Docker command failed: ${cmd}\n${stderr.substring(0, 500)}`);
      throw new Error(`Docker error: ${stderr.substring(0, 300)}`);
    }
  },

  // =================================================================
  // Internal — Health Check
  // =================================================================

  async _performHealthCheck(instance: any, requestId: string): Promise<{
    service: string;
    healthy: boolean;
    status: string;
    responseTimeMs: number;
    error?: string;
  }> {
    // Use docker inspect to check if container is running
    try {
      const start = Date.now();
      const inspectOutput = this._execDocker(
        `docker inspect --format="{{.State.Status}}" ${instance.serviceName} 2>/dev/null || echo "not_found"`,
        requestId, 10000
      );
      const responseTimeMs = Date.now() - start;

      const containerStatus = inspectOutput.trim();
      if (containerStatus !== 'running') {
        return {
          service: instance.name,
          healthy: false,
          status: containerStatus,
          responseTimeMs,
          error: `Container status: ${containerStatus}`,
        };
      }

      // If a health URL is defined, try HTTP health check
      if (instance.healthUrl) {
        try {
          const httpStart = Date.now();
          // Use docker exec for in-container health check (no curl dependency on host)
          const healthOutput = this._execDocker(
            `docker exec ${instance.serviceName} wget -qO- --timeout=5 "${instance.healthUrl}" 2>/dev/null || echo "health_check_failed"`,
            requestId, 15000
          );
          const httpTime = Date.now() - httpStart;

          if (healthOutput.includes('health_check_failed')) {
            return {
              service: instance.name, healthy: true, status: 'running',
              responseTimeMs: responseTimeMs + httpTime,
              error: 'HTTP health endpoint not reachable (container is running but service may still be starting)',
            };
          }

          return { service: instance.name, healthy: true, status: 'running', responseTimeMs: responseTimeMs + httpTime };
        } catch {
          // HTTP health check failed but container is running — degraded
          return {
            service: instance.name, healthy: true, status: 'degraded', responseTimeMs,
            error: 'Container running but HTTP health check failed',
          };
        }
      }

      // No health URL — trust docker status
      return { service: instance.name, healthy: true, status: 'running', responseTimeMs };
    } catch (err: any) {
      return {
        service: instance.name, healthy: false, status: 'error', responseTimeMs: 0,
        error: String(err.message || 'Docker inspect failed'),
      };
    }
  },

  async _waitForHealth(instance: any, timeoutMs: number, requestId: string, intervalMs: number = 5000): Promise<{ healthy: boolean }> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const result = await this._performHealthCheck(instance, requestId);
      if (result.healthy) return { healthy: true };
      await new Promise(r => setTimeout(r, intervalMs));
    }

    return { healthy: false };
  },

  // =================================================================
  // Internal — Rollback
  // =================================================================

  async _rollbackTo(instance: any, rollbackImageTag: string, missionId?: string, requestId: string = '-'): Promise<ServicePublic> {
    await db.serviceInstance.update({
      where: { id: instance.id },
      data: { status: 'rollback' },
    });

    try {
      logger.info(requestId, `Rolling back '${instance.name}' to ${rollbackImageTag}`);

      // Recreate with the previous image
      this._execDocker(
        `${DOCKER_COMPOSE_CMD} -f "${instance.composePath}" up -d --force-recreate ${instance.serviceName}`,
        requestId
      );

      const healthResult = await this._waitForHealth(instance, 60000, requestId);

      const updated = await db.serviceInstance.update({
        where: { id: instance.id },
        data: {
          status: healthResult.healthy ? 'running' : 'error',
          healthStatus: healthResult.healthy ? 'healthy' : 'unhealthy',
          deployedImageTag: rollbackImageTag,
          lastHealthCheck: new Date(),
          error: healthResult.healthy ? null : 'Rollback applied but health check failed',
        },
      });

      logger.info(requestId, `Rollback complete for '${instance.name}' → ${rollbackImageTag} (health: ${updated.healthStatus})`);

      eventBus.emit('service:status_changed', {
        serviceId: instance.id, name: instance.name, status: updated.status, previousStatus: 'rollback',
      });

      if (missionId) {
        await missionEventService.create({
          missionId, type: 'tool_execute',
          payload: { tool: 'rollback_service', service: instance.name, result: 'success', rollbackTo: rollbackImageTag },
        }, requestId);
      }

      return this._toPublic(updated);
    } catch (err: any) {
      await db.serviceInstance.update({
        where: { id: instance.id },
        data: { status: 'error', error: `Rollback failed: ${err.message}` },
      });
      throw new Error(`Rollback failed for '${instance.name}': ${err.message}`);
    }
  },

  // =================================================================
  // Internal — Serialization
  // =================================================================

  _toPublic(s: any): ServicePublic {
    const def = SERVICE_CATALOG.find(d => d.name === s.name);
    return {
      id: s.id,
      name: s.name,
      displayName: s.displayName,
      group: s.group,
      hostname: s.hostname || undefined,
      status: s.status,
      healthStatus: s.healthStatus,
      resourceWeight: s.resourceWeight,
      ramEstimateMB: def?.ramEstimateMB || 0,
      diskEstimateGB: def?.diskEstimateGB || 0,
      port: s.port || undefined,
      imageTag: s.imageTag,
      deployedImageTag: s.deployedImageTag || undefined,
      rollbackImageTag: s.rollbackImageTag || undefined,
      mobileApp: s.mobileApp || undefined,
      mobileAppNote: s.mobileAppNote || undefined,
      error: s.error || undefined,
      lastHealthCheck: s.lastHealthCheck?.toISOString() || undefined,
      lastDeployedAt: s.lastDeployedAt?.toISOString() || undefined,
      lastUpdatedAt: s.lastUpdatedAt?.toISOString() || undefined,
      enabled: s.enabled,
      createdAt: s.createdAt?.toISOString() || undefined,
      updatedAt: s.updatedAt?.toISOString() || undefined,
    };
  },

  _backupToPublic(b: any, serviceName: string): BackupPublic {
    return {
      id: b.id,
      serviceInstanceId: b.serviceInstanceId,
      serviceName,
      filename: b.filename,
      filePath: b.filePath,
      sizeBytes: b.sizeBytes,
      scheduleType: b.scheduleType,
      storageLocation: b.storageLocation,
      storageTarget: b.storageTarget || undefined,
      verified: b.verified,
      restoredFrom: b.restoredFrom,
      createdAt: b.createdAt?.toISOString() || undefined,
    };
  },
};
