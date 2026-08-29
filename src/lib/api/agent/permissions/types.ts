/**
 * Permission system for computer-control capabilities.
 * Every capability must be explicitly granted by the user.
 * Nothing is on by default.
 */

export type Capability =
  | 'screenshot'
  | 'mouse_move'
  | 'mouse_click'
  | 'mouse_scroll'
  | 'key_type'
  | 'key_press'
  | 'clipboard_read'
  | 'clipboard_write'
  | 'filesystem_read'
  | 'filesystem_write'
  | 'filesystem_delete'
  | 'shell_execute'
  | 'app_launch'
  | 'app_close'
  | 'window_list'
  | 'window_focus'
  | 'window_info'
  // Phase 16 — Service Lifecycle
  | 'service_deploy'
  | 'service_update'
  | 'service_restart'
  | 'service_backup'
  | 'service_health_check'
  | 'service_rollback';

/**
 * Capabilities that require approval before execution.
 * These are the hard-block list from the spec:
 * destructive filesystem ops, financial actions, account/password changes,
 * and publishing require an approval-queue entry.
 */
export const REQUIRES_APPROVAL_CAPABILITIES: Set<Capability> = new Set([
  'filesystem_delete',
  'shell_execute',
  'app_close',
]);

/**
 * Hard-blocked capabilities — returns a fresh Set each call
 * to avoid Bun ESM module singleton issues where Set references
 * can differ between modules.
 */
export function getHardBlockedCapabilities(): Set<string> {
  return new Set([
    'filesystem_delete',
    'shell_execute',
    // Future: 'financial_action', 'account_change', 'publish'
  ]);
}

/**
 * Risk levels for capabilities.
 */
export const CAPABILITY_RISK: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  screenshot: 'low',
  mouse_move: 'medium',
  mouse_click: 'high',
  mouse_scroll: 'low',
  key_type: 'high',
  key_press: 'medium',
  clipboard_read: 'medium',
  clipboard_write: 'high',
  filesystem_read: 'low',
  filesystem_write: 'medium',
  filesystem_delete: 'critical',
  shell_execute: 'critical',
  app_launch: 'medium',
  app_close: 'high',
  window_list: 'low',
  window_focus: 'medium',
  window_info: 'low',
  // Phase 16 — Service Lifecycle
  // NOTE: service_deploy and service_update are medium, not high,
  // because they use staged updates with auto-rollback.
  // Destructive actions (volume deletion) are NOT exposed as capabilities.
  service_deploy: 'medium',
  service_update: 'medium',
  service_restart: 'low',
  service_backup: 'low',
  service_health_check: 'low',
  service_rollback: 'high',
};

export interface PermissionGrant {
  capability: Capability;
  granted: boolean;
  grantedAt?: Date;
  scope?: 'session' | 'mission' | 'permanent';
  missionId?: string;
}
