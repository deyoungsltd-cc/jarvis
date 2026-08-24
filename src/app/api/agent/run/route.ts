import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createQwenProvider } from '@/lib/agent/qwen-provider';
import type { ChatMessage } from '@/lib/agent/types';

const SYSTEM_PROMPT = `You are JARVIS, an autonomous AI assistant powered by Qwen. You receive a goal from the user and accomplish it.

Your workflow:
1. Understand what the user wants
2. Decide if you can answer directly or need more info
3. Provide a clear, helpful response
4. Be concise but thorough

You have access to real-time data through your tools. Use them when needed.`;

const MAX_ITERATIONS = 10;

export async function POST(req: NextRequest) {
  try {
    const { goal, missionId, provider } = await req.json();

    if (!goal) {
      return NextResponse.json({ error: 'goal is required' }, { status: 400 });
    }

    // Use existing mission or create one
    let mission;
    if (missionId) {
      mission = await db.mission.findUnique({ where: { id: missionId } });
    }
    if (!mission) {
      mission = await db.mission.create({
        data: {
          goal,
          status: 'running',
          provider: provider || 'qwen',
        },
      });
    } else {
      await db.mission.update({
        where: { id: mission.id },
        data: { status: 'running', provider: provider || 'qwen' },
      });
    }

    // Create provider
    const model = createQwenProvider();

    // Build messages
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: goal },
    ];

    let totalTokens = 0;
    let iteration = 0;
    let finalContent: string | null = null;

    // Agent loop
    while (iteration < MAX_ITERATIONS) {
      iteration++;

      const response = await model.chat(messages);
      totalTokens += response.usage.totalTokens;

      // If Qwen produced text, we're done
      if (response.content) {
        finalContent = response.content;
        break;
      }

      // If Qwen wants to call tools but no tools registered, tell it to answer directly
      if (response.toolCalls.length > 0) {
        messages.push({
          role: 'tool',
          toolCallId: response.toolCalls[0].id,
          toolName: response.toolCalls[0].name,
          content: JSON.stringify({ note: 'Tool execution not available in serverless mode. Please answer based on your knowledge.' }),
        });
        continue;
      }

      // Empty response — nudge
      messages.push({
        role: 'user',
        content: 'Please provide your response.',
      });
    }

    // Update mission
    await db.mission.update({
      where: { id: mission.id },
      data: {
        status: 'completed',
        tokenCount: totalTokens,
        error: finalContent ? null : 'No response generated',
      },
    });

    // Save event
    await db.missionEvent.create({
      data: {
        missionId: mission.id,
        type: 'complete',
        payload: JSON.stringify({ content: finalContent, tokens: totalTokens, iterations: iteration }),
      },
    });

    return NextResponse.json({
      mission: {
        id: mission.id,
        status: 'completed',
        goal: mission.goal,
        tokenCount: totalTokens,
      },
      content: finalContent,
    });
  } catch (error: any) {
    const message = error?.message || 'Agent run failed';

    // Try to mark mission as failed if we have one
    try {
      const body = await req.json().catch(() => ({}));
      if (body.missionId) {
        await db.mission.update({
          where: { id: body.missionId },
          data: { status: 'failed', error: message },
        });
      }
    } catch {}

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
