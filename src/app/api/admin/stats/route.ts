import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';

// GET /api/admin/stats — dashboard overview
export async function GET() {
  try {
    await requireAdmin();

    const [totalUsers, adminCount, frozenCount, totalMissions, activeMissions, completedMissions, totalKeys, activeKeys] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { role: 'admin' } }),
      db.user.count({ where: { frozen: true } }),
      db.mission.count(),
      db.mission.count({ where: { status: 'running' } }),
      db.mission.count({ where: { status: 'completed' } }),
      db.inviteKey.count(),
      db.inviteKey.count({ where: { active: true } }),
    ]);

    const recentUsers = await db.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const recentAuditLogs = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      totalUsers, adminCount, frozenCount,
      totalMissions, activeMissions, completedMissions,
      totalKeys, activeKeys,
      recentUsers, recentAuditLogs,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('Admin stats error:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
