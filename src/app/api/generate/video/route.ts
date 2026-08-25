import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Store task IDs for polling
const videoTasks = new Map<string, { status: string; url?: string; error?: string; createdAt: number }>();

/**
 * POST /api/generate/video
 * Creates a video generation task via MiniMax Hailuo
 * Body: { prompt, model? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const { prompt, model } = await req.json();
    if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'MINIMAX_API_KEY not set. Add it in Settings or Vercel env. Get a key at minimax.io' },
        { status: 400 }
      );
    }

    const taskId = crypto.randomUUID();

    // Create MiniMax video generation task
    const res = await fetch('https://api.minimax.chat/v1/video_generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'video-01',
        prompt,
        first_frame_image: undefined,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`MiniMax Video API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    const minimaxTaskId = data.task_id;

    // Store for polling
    videoTasks.set(taskId, {
      status: 'processing',
      createdAt: Date.now(),
    });

    // Start polling in background
    pollMiniMaxVideo(apiKey, taskId, minimaxTaskId);

    return NextResponse.json({ taskId, minimaxTaskId, status: 'processing' }, { status: 202 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Video generation failed';
    console.error('Video gen error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/generate/video?taskId=xxx
 * Check status of a video generation task
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const taskId = new URL(req.url).searchParams.get('taskId');
  if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 });

  const task = videoTasks.get(taskId);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  return NextResponse.json(task);
}

async function pollMiniMaxVideo(apiKey: string, localTaskId: string, minimaxTaskId: string) {
  const maxPolls = 60; // 5 minutes at 5s intervals
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const res = await fetch(`https://api.minimax.chat/v1/query/video_generation?task_id=${minimaxTaskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!res.ok) continue;

      const data = await res.json();
      const status = data.task_status;

      if (status === 'Success') {
        const videoUrl = data.file_id
          ? `https://fileapi.minimax.chat/v1/file_transfer/download?task_id=${minimaxTaskId}&file_id=${data.file_id}`
          : data.video_url;
        videoTasks.set(localTaskId, { status: 'completed', url: videoUrl, createdAt: videoTasks.get(localTaskId)?.createdAt || Date.now() });
        return;
      }
      if (status === 'Failed') {
        videoTasks.set(localTaskId, { status: 'failed', error: data.base_resp?.status_msg || 'Video generation failed', createdAt: videoTasks.get(localTaskId)?.createdAt || Date.now() });
        return;
      }
    } catch (err) {
      console.error('Video poll error:', err);
    }
  }
  // Timeout
  videoTasks.set(localTaskId, { status: 'failed', error: 'Video generation timed out', createdAt: videoTasks.get(localTaskId)?.createdAt || Date.now() });
}
