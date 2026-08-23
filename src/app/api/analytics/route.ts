import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalMissions,
      missionsByStatus,
      missionsByProvider,
      toolUsageCounts,
      dailyMissionCounts,
      totalMemoryEntries,
      approvalStats,
    ] = await Promise.all([
      db.mission.count(),
      db.mission.groupBy({ by: ['status'], _count: { status: true } }),
      db.mission.groupBy({ by: ['provider'], _count: { provider: true }, where: { provider: { not: null } } }),
      db.missionEvent.groupBy({ by: ['type'], _count: { type: true } }),
      db.mission.groupBy({
        by: ['createdAt'],
        _count: { id: true },
        where: { createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: 'asc' },
      }),
      db.memoryEntry.count(),
      db.approvalRequest.groupBy({ by: ['status'], _count: { status: true } }),
    ]);

    // Format daily counts by date string
    const dailyCounts: Record<string, number> = {};
    for (const item of dailyMissionCounts) {
      const dateStr = item.createdAt.toISOString().split('T')[0];
      dailyCounts[dateStr] = (dailyCounts[dateStr] || 0) + item._count.id;
    }

    return NextResponse.json({
      totalMissions,
      missionsByStatus: missionsByStatus.map((m) => ({ status: m.status, count: m._count.status })),
      missionsByProvider: missionsByProvider.map((m) => ({ provider: m.provider, count: m._count.provider })),
      toolUsageCounts: toolUsageCounts.map((t) => ({ type: t.type, count: t._count.type })),
      dailyMissionCounts: dailyCounts,
      totalMemoryEntries,
      approvalStats: approvalStats.map((a) => ({ status: a.status, count: a._count.status })),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
