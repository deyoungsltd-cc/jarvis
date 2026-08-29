/**
 * Permission manager — checks capability grants before tool execution.
 * All checks are at execution time, not just at connection time.
 */
import {
  Capability,
  PermissionGrant,
  getHardBlockedCapabilities,
  CAPABILITY_RISK,
} from '@/lib/api/types.js';

export class PermissionManager {
  private grants = new Map<Capability, PermissionGrant>();

  /** Grant a capability */
  grant(capability: Capability, options?: { scope?: 'session' | 'mission' | 'permanent'; missionId?: string }) {
    this.grants.set(capability, {
      capability,
      granted: true,
      grantedAt: new Date(),
      scope: options?.scope || 'session',
      missionId: options?.missionId,
    });
  }

  /** Revoke a capability */
  revoke(capability: Capability) {
    this.grants.delete(capability);
  }

  /** Check if a capability is granted */
  isGranted(capability: Capability): boolean {
    return this.grants.get(capability)?.granted === true;
  }

  /**
   * Check if a capability can execute.
   * Returns { allowed: true } or { allowed: false, reason: string }.
   *
   * This is called BEFORE every tool execution, not just at connection time.
   */
  check(capability: Capability): { allowed: boolean; reason?: string } {
    // Hard-blocked capabilities require the approval system (Phase 9)
    if (getHardBlockedCapabilities().has(capability)) {
      return {
        allowed: false,
        reason: `requires_approval`,
      };
    }

    // Capability must be explicitly granted
    if (!this.isGranted(capability)) {
      return {
        allowed: false,
        reason: `capability '${capability}' not granted. User must explicitly grant this permission.`,
      };
    }

    return { allowed: true };
  }

  /** Get all grants */
  getAllGrants(): PermissionGrant[] {
    return Array.from(this.grants.values());
  }

  /** Get all capabilities with their grant status */
  getAllCapabilities(): Array<{ capability: string; granted: boolean; risk: string }> {
    const all: Capability[] = [
      'screenshot', 'mouse_move', 'mouse_click', 'mouse_scroll',
      'key_type', 'key_press', 'clipboard_read', 'clipboard_write',
      'filesystem_read', 'filesystem_write', 'filesystem_delete',
      'shell_execute', 'app_launch', 'app_close',
      'window_list', 'window_focus', 'window_info',
    ];
    return all.map(cap => ({
      capability: cap,
      granted: this.isGranted(cap),
      risk: CAPABILITY_RISK[cap] || 'low',
    }));
  }
}

// Singleton for the running server
let instance: PermissionManager | null = null;

export function getPermissionManager(): PermissionManager {
  if (!instance) {
    instance = new PermissionManager();
  }
  return instance;
}
