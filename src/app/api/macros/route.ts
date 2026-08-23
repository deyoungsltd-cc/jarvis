import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const macros = await db.macro.findMany({
      include: { workspace: { select: { id: true, name: true } }, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(macros);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch macros' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.steps) {
      return NextResponse.json({ error: 'name and steps are required' }, { status: 400 });
    }
    const steps = typeof body.steps === 'string' ? body.steps : JSON.stringify(body.steps);
    const macro = await db.macro.create({
      data: {
        name: body.name,
        description: body.description,
        trigger: body.trigger,
        steps,
        enabled: body.enabled ?? true,
        workspaceId: body.workspaceId,
        userId: body.userId,
      },
    });
    return NextResponse.json(macro, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create macro' }, { status: 500 });
  }
}
