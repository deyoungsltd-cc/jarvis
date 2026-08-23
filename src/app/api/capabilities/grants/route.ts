import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const grants = await db.capabilityGrant.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(grants);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch capability grants' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.capability) {
      return NextResponse.json({ error: 'capability is required' }, { status: 400 });
    }
    const grant = await db.capabilityGrant.create({
      data: {
        capability: body.capability,
        allowed: body.allowed ?? true,
        scopeType: body.scopeType || 'permanent',
        scopeContext: body.scopeContext ? JSON.stringify(body.scopeContext) : null,
        missionId: body.missionId,
        source: body.source || 'manual',
        approvalRequestId: body.approvalRequestId,
      },
    });
    return NextResponse.json(grant, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create capability grant' }, { status: 500 });
  }
}