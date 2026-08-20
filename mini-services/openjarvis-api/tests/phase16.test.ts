/**
 * Phase 16 Tests — Sovereign Stack
 *
 * Tests for service catalog, service manager, tool definitions,
 * permission gating, and resource estimation.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { db } from '../src/utils/db.js';
import { serviceManager } from '../src/services/serviceManager.js';
import { SERVICE_CATALOG, getResourceSummary, getServicesByGroup, getServiceDefinition } from '../src/services/serviceCatalog.js';
import { createAllServiceLifecycleTools } from '../src/agent/tools/service-lifecycle/index.js';
import { CAPABILITY_RISK } from '../src/agent/permissions/types.js';

// Clean DB before each test
beforeEach(async () => {
  await db.serviceBackup.deleteMany();
  await db.serviceInstance.deleteMany();
});

describe('Phase 16 — Service Catalog', () => {
  it('has exactly 20 services', () => {
    expect(SERVICE_CATALOG.length).toBe(20);
  });

  it('has 5 services in each group', () => {
    expect(getServicesByGroup('A').length).toBe(5);
    expect(getServicesByGroup('B').length).toBe(5);
    expect(getServicesByGroup('C').length).toBe(5);
    expect(getServicesByGroup('D').length).toBe(5);
  });

  it('each service has required fields', () => {
    for (const svc of SERVICE_CATALOG) {
      expect(svc.name).toBeDefined();
      expect(svc.displayName).toBeDefined();
      expect(['A', 'B', 'C', 'D']).toContain(svc.group);
      expect(svc.repoUrl).toContain('github.com');
      expect(svc.replaces).toBeDefined();
      expect(svc.hostname).toContain('.internal');
      expect(svc.serviceName).toBeDefined();
      expect(svc.imageTag).toContain('/');
      expect(['lightweight', 'moderate', 'heavy', 'on-demand']).toContain(svc.resourceWeight);
      expect(svc.ramEstimateMB).toBeGreaterThan(0);
      expect(svc.port).toBeGreaterThan(0);
    }
  });

  it('SearXNG is defined once (Phase 14 reuse)', () => {
    const searxng = SERVICE_CATALOG.filter(s => s.name === 'searxng');
    expect(searxng.length).toBe(1);
    expect(searxng[0].notes).toContain('SAME INSTANCE');
  });

  it('Home Assistant has empty shell note', () => {
    const ha = getServiceDefinition('homeassistant');
    expect(ha).toBeDefined();
    expect(ha!.notes).toContain('EMPTY SHELL');
  });

  it('services with mobile apps have pairing notes', () => {
    const mobileServices = SERVICE_CATALOG.filter(s => s.mobileApp);
    const mobileAppNames = mobileServices.map(s => s.mobileApp);
    expect(mobileAppNames).toContain('Immich');
    expect(mobileAppNames).toContain('Bitwarden');
    expect(mobileAppNames).toContain('Nextcloud');
    expect(mobileAppNames).toContain('Home Assistant');

    for (const svc of mobileServices) {
      expect(svc.mobileAppNote).toBeDefined();
      expect(svc.mobileAppNote!.length).toBeGreaterThan(0);
    }
  });
});

describe('Phase 16 — Resource Estimation', () => {
  it('getResourceSummary returns valid summary', () => {
    const summary = getResourceSummary();
    expect(summary.totalRamEstimateMB).toBeGreaterThan(0);
    expect(summary.totalDiskEstimateGB).toBeGreaterThan(0);
    expect(summary.alwaysOnRamMB).toBeLessThan(summary.totalRamEstimateMB);
    expect(summary.onDemandRamMB).toBeGreaterThan(0);
  });

  it('always-on services need less RAM than total', () => {
    const summary = getResourceSummary();
    // Always-on should be a subset
    expect(summary.alwaysOnRamMB + summary.onDemandRamMB).toBe(summary.totalRamEstimateMB);
  });

  it('on-demand services are correctly categorized', () => {
    const onDemand = SERVICE_CATALOG.filter(s => s.resourceWeight === 'on-demand');
    // Upscayl, Whisper, Audiblez, Rembg, Spleeter, pyVideoTrans, OCRmyPDF
    expect(onDemand.length).toBeGreaterThanOrEqual(5);
    const onDemandNames = onDemand.map(s => s.name);
    expect(onDemandNames).toContain('upscayl');
    expect(onDemandNames).toContain('whisper');
  });
});

describe('Phase 16 — Service Manager Seed', () => {
  it('seeds all 20 services into the DB', async () => {
    const result = await serviceManager.seed('test');
    expect(result.total).toBe(20);
    expect(result.seeded).toBe(20);

    // Verify they're in the DB
    const services = await serviceManager.list(undefined, 'test');
    expect(services.length).toBe(20);
  });

  it('idempotent seed (second call seeds 0)', async () => {
    await serviceManager.seed('test');
    const result = await serviceManager.seed('test');
    expect(result.total).toBe(20);
    expect(result.seeded).toBe(0);
  });

  it('lists services by group', async () => {
    await serviceManager.seed('test');
    const groupA = await serviceManager.list({ group: 'A' }, 'test');
    expect(groupA.length).toBe(5);
    for (const svc of groupA) {
      expect(svc.group).toBe('A');
    }
  });

  it('gets service by name', async () => {
    await serviceManager.seed('test');
    const immich = await serviceManager.getByName('immich', 'test');
    expect(immich.name).toBe('immich');
    expect(immich.displayName).toContain('Immich');
    expect(immich.hostname).toBe('photos.internal');
    expect(immich.mobileApp).toBe('Immich');
  });

  it('throws for unknown service', async () => {
    await expect(serviceManager.getByName('nonexistent', 'test')).rejects.toThrow();
  });
});

describe('Phase 16 — Service Lifecycle Tools', () => {
  it('creates all 6 tools', () => {
    const tools = createAllServiceLifecycleTools();
    expect(tools.length).toBe(6);

    const names = tools.map(t => t.name);
    expect(names).toContain('deploy_service');
    expect(names).toContain('update_service');
    expect(names).toContain('restart_service');
    expect(names).toContain('backup_service');
    expect(names).toContain('check_service_health');
    expect(names).toContain('rollback_service');
  });

  it('tools have correct risk levels', () => {
    const tools = createAllServiceLifecycleTools();
    const riskMap = Object.fromEntries(tools.map(t => [t.name, t.riskLevel]));

    expect(riskMap['deploy_service']).toBe('medium');
    expect(riskMap['update_service']).toBe('medium');
    expect(riskMap['restart_service']).toBe('low');
    expect(riskMap['backup_service']).toBe('low');
    expect(riskMap['check_service_health']).toBe('low');
    expect(riskMap['rollback_service']).toBe('high');
  });

  it('tools have capability property set', () => {
    const tools = createAllServiceLifecycleTools();
    for (const tool of tools) {
      expect(tool.capability).toBeDefined();
      expect(tool.capability!.startsWith('service_')).toBe(true);
    }
  });

  it('tools have valid JSON schemas', () => {
    const tools = createAllServiceLifecycleTools();
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
      expect(tool.inputSchema.required).toBeDefined();
      expect(tool.inputSchema.required.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('tools return error for unknown service', async () => {
    const tools = createAllServiceLifecycleTools();
    const deployTool = tools.find(t => t.name === 'deploy_service')!;

    const result = await deployTool.execute({ service: 'nonexistent_service' });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('not found');
  });
});

describe('Phase 16 — Permission / Risk Tiering', () => {
  it('service capabilities exist in CAPABILITY_RISK', () => {
    const serviceCaps = [
      'service_deploy',
      'service_update',
      'service_restart',
      'service_backup',
      'service_health_check',
      'service_rollback',
    ];

    for (const cap of serviceCaps) {
      expect(CAPABILITY_RISK[cap]).toBeDefined();
    }
  });

  it('routine actions are low risk (eligible for always-allow)', () => {
    expect(CAPABILITY_RISK['service_backup']).toBe('low');
    expect(CAPABILITY_RISK['service_health_check']).toBe('low');
    expect(CAPABILITY_RISK['service_restart']).toBe('low');
  });

  it('deploy and update are medium (not low, not critical)', () => {
    expect(CAPABILITY_RISK['service_deploy']).toBe('medium');
    expect(CAPABILITY_RISK['service_update']).toBe('medium');
  });

  it('rollback is high risk', () => {
    expect(CAPABILITY_RISK['service_rollback']).toBe('high');
  });

  it('destructive actions (volume deletion) are NOT exposed as capabilities', () => {
    // Only the 6 safe lifecycle capabilities exist.
    // There is NO 'service_delete_volume' or 'service_destroy' capability.
    const dangerousCaps = ['service_delete_volume', 'service_destroy', 'service_wipe'];
    for (const cap of dangerousCaps) {
      expect(CAPABILITY_RISK[cap]).toBeUndefined();
    }
  });
});

describe('Phase 16 — Resource Report', () => {
  it('returns a valid resource report', async () => {
    await serviceManager.seed('test');
    const report = await serviceManager.getResourceReport('test');

    expect(report.resourceSummary).toBeDefined();
    expect(report.totalRegistered).toBe(20);
    expect(report.deployedCount).toBe(0); // nothing deployed yet
    expect(report.openRisks).toBeDefined();
    expect(report.openRisks.length).toBeGreaterThanOrEqual(1);
  });

  it('reports single-disk backup risk', async () => {
    await serviceManager.seed('test');
    const report = await serviceManager.getResourceReport('test');

    const backupRisk = report.openRisks.find(r => r.risk === 'Single-disk backup');
    expect(backupRisk).toBeDefined();
    expect(backupRisk!.mitigation).toBeDefined();
  });
});

describe('Phase 16 — Backup Listing (no Docker needed)', () => {
  it('lists empty backups before any are created', async () => {
    await serviceManager.seed('test');
    const backups = await serviceManager.listBackups(undefined, 'test');
    expect(backups.length).toBe(0);
  });

  it('lists empty backups for specific service', async () => {
    await serviceManager.seed('test');
    const backups = await serviceManager.listBackups('vaultwarden', 'test');
    expect(backups.length).toBe(0);
  });
});
