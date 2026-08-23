import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const missionId = searchParams.get('missionId');
    const riskLevel = searchParams.get('riskLevel');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (missionId) where.missionId = missionId;
    if (riskLevel) where.riskLevel = riskLevel;

    const approvals = await db.approvalRequest.findMany({
      where,
      include: { mission: { select: { id: true, goal: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(approvals);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.missionId || !body.toolName) {
      return NextResponse.json({ error: 'missionId and toolName are required' }, { status: 400 });
    }
    const approval = await db.approvalRequest.create({
      data: {
        missionId: body.missionId,
        toolName: body.toolName,
        capability: body.capability,
        riskLevel: body.riskLevel || 'medium',
        reason: body.reason,
        toolInput: body.toolInput ? JSON.stringify(body.toolInput) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    return NextResponse.json(approval, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create approval request' }, { status: 500 });
  }
}
