import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const jobs = await db.scheduledJob.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(jobs);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch scheduled jobs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.cronExpr || !body.goal) {
      return NextResponse.json({ error: 'name, cronExpr, and goal are required' }, { status: 400 });
    }
    const job = await db.scheduledJob.create({
      data: {
        name: body.name,
        cronExpr: body.cronExpr,
        goal: body.goal,
        provider: body.provider,
        enabled: body.enabled ?? true,
      },
    });
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create scheduled job' }, { status: 500 });
  }
}
