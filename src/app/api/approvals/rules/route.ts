import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const rules = await db.approvalRule.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }] });
    return NextResponse.json(rules);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch approval rules' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const rule = await db.approvalRule.create({
      data: {
        name: body.name,
        description: body.description,
        enabled: body.enabled ?? true,
        matchRiskLevels: body.matchRiskLevels ? JSON.stringify(body.matchRiskLevels) : null,
        matchToolNames: body.matchToolNames ? JSON.stringify(body.matchToolNames) : null,
        matchCapabilities: body.matchCapabilities ? JSON.stringify(body.matchCapabilities) : null,
        action: body.action || 'require_manual',
        priority: body.priority ?? 0,
      },
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create approval rule' }, { status: 500 });
  }
}
