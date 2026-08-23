import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { missionId, format, includeEvents } = body;

    if (!missionId || !format) {
      return NextResponse.json({ error: 'missionId and format are required' }, { status: 400 });
    }

    if (!['pdf', 'markdown', 'json'].includes(format)) {
      return NextResponse.json({ error: 'format must be pdf, markdown, or json' }, { status: 400 });
    }

    const mission = await db.mission.findUnique({
      where: { id: missionId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });

    if (!mission) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    }

    const events = includeEvents !== false ? mission.events : [];

    if (format === 'json') {
      const jsonContent = JSON.stringify({ mission, events }, null, 2);
      return new NextResponse(jsonContent, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="mission-${missionId}.json"`,
        },
      });
    }

    if (format === 'markdown') {
      let md = `# Mission: ${mission.goal}\n\n`;
      md += `- **Status**: ${mission.status}\n`;
      md += `- **Provider**: ${mission.provider || 'N/A'}\n`;
      md += `- **Created**: ${mission.createdAt.toISOString()}\n`;
      md += `- **Token Count**: ${mission.tokenCount}\n`;
      md += `- **Tool Calls**: ${mission.toolCallCount}\n`;
      if (mission.error) md += `- **Error**: ${mission.error}\n`;
      md += '\n---\n\n';

      if (events.length > 0) {
        md += '## Events\n\n';
        for (const event of events) {
          md += `### ${event.type} — ${event.createdAt.toISOString()}\n\n`;
          if (event.payload) {
            try {
              const parsed = JSON.parse(event.payload);
              md += '```json\n' + JSON.stringify(parsed, null, 2) + '\n```\n\n';
            } catch {
              md += event.payload + '\n\n';
            }
          }
          md += '---\n\n';
        }
      }

      return new NextResponse(md, {
        headers: {
          'Content-Type': 'text/markdown',
          'Content-Disposition': `attachment; filename="mission-${missionId}.md"`,
        },
      });
    }

    // PDF: return markdown content that frontend can convert
    let content = `Mission: ${mission.goal}\nStatus: ${mission.status}\nProvider: ${mission.provider || 'N/A'}\nCreated: ${mission.createdAt.toISOString()}\nToken Count: ${mission.tokenCount}\nTool Calls: ${mission.toolCallCount}\n`;
    if (mission.error) content += `Error: ${mission.error}\n`;
    content += '\n---\n\nEvents:\n';
    for (const event of events) {
      content += `\n[${event.type}] ${event.createdAt.toISOString()}\n`;
      if (event.payload) content += event.payload + '\n';
    }

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="mission-${missionId}.txt"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to export mission' }, { status: 500 });
  }
}
