import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

const DESKTOP_CAPABILITIES: { capability: string; riskLevel: 'low' | 'medium' | 'high' | 'critical' }[] = [
  { capability: 'screenshot', riskLevel: 'medium' },
  { capability: 'mouse_move', riskLevel: 'low' },
  { capability: 'mouse_click', riskLevel: 'low' },
  { capability: 'mouse_drag', riskLevel: 'medium' },
  { capability: 'mouse_scroll', riskLevel: 'low' },
  { capability: 'key_type', riskLevel: 'medium' },
  { capability: 'key_combo', riskLevel: 'medium' },
  { capability: 'key_hotkey', riskLevel: 'high' },
  { capability: 'clipboard_read', riskLevel: 'high' },
  { capability: 'clipboard_write', riskLevel: 'high' },
  { capability: 'filesystem_read', riskLevel: 'high' },
  { capability: 'filesystem_write', riskLevel: 'critical' },
  { capability: 'shell_execute', riskLevel: 'critical' },
  { capability: 'app_launch', riskLevel: 'medium' },
  { capability: 'app_close', riskLevel: 'high' },
  { capability: 'window_list', riskLevel: 'low' },
  { capability: 'window_focus', riskLevel: 'medium' },
];

export async function GET() {
  try {
    const grants = await db.capabilityGrant.findMany({
      where: { allowed: true },
      select: { capability: true },
    });

    const grantedSet = new Set(grants.map((g) => g.capability));

    const statuses = DESKTOP_CAPABILITIES.map((cap) => ({
      capability: cap.capability,
      riskLevel: cap.riskLevel,
      granted: grantedSet.has(cap.capability),
    }));

    return Response.json(statuses);
  } catch (err) {
    return handleError(err);
  }
}
