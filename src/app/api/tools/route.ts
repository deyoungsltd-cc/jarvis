import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const tools = await db.tool.findMany({ orderBy: { name: 'asc' } });
    return NextResponse.json(tools);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch tools' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    if (!body.name || !body.description) {
      return NextResponse.json({ error: 'name and description are required' }, { status: 400 });
    }
    const tool = await db.tool.create({
      data: {
        name: body.name,
        description: body.description,
        parameters: body.parameters ? JSON.stringify(body.parameters) : null,
        riskLevel: body.riskLevel || 'medium',
        enabled: body.enabled ?? true,
      },
    });
    return NextResponse.json(tool, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to register tool' }, { status: 500 });
  }
}
