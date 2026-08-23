import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const webhooks = await db.webhook.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(webhooks);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.url || !body.events) {
      return NextResponse.json({ error: 'url and events are required' }, { status: 400 });
    }
    const events = typeof body.events === 'string' ? body.events : JSON.stringify(body.events);
    const webhook = await db.webhook.create({
      data: {
        url: body.url,
        events,
        secret: body.secret,
        enabled: body.enabled ?? true,
      },
    });
    return NextResponse.json(webhook, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
  }
}