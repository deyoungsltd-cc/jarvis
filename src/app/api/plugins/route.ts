import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const plugins = await db.plugin.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(plugins);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch plugins' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const plugin = await db.plugin.create({
      data: {
        name: body.name,
        version: body.version,
        description: body.description,
        enabled: body.enabled ?? true,
        config: body.config ? JSON.stringify(body.config) : null,
      },
    });
    return NextResponse.json(plugin, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to register plugin' }, { status: 500 });
  }
}
