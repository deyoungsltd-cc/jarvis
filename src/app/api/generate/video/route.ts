import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Store task IDs for polling
const videoTasks = new Map<string, { status: string; url?: string; error?: string; createdAt: number; provider?: string }>();

// Replicate model mappings
const REPLICATE_MODELS: Record<string, string> = {
  'kling-v2': 'kwaivgi/kling-v2/master',
  'kling-v2-pro': 'kwaivgi/kling-v2/pro',
  'minimax-hailuo': 'minimax/video-01',
  'minimax-video-01-live': 'minimax/video-01-live',
};

/**
 * POST /api/generate/video
 * Creates a video generation task
 * Body: { prompt, model?, provider? }
 * provider: "replicate" (free $5 credit) or "minimax" (default)
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const { prompt, model, provider } = await req.json();
    if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

    const useProvider = provider || process.env.VIDEO_PROVIDER || 'replicate';
    const taskId = crypto.randomUUID();

    if (useProvider === 'replicate') {
      return handleReplicate(prompt, model, taskId);
    }
    return handleMiniMax(prompt, model, taskId);
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

// ─── Replicate Provider (free $5 credit at signup) ────────────────

function handleReplicate(prompt: string, model: string | undefined, taskId: string) {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'REPLICATE_API_TOKEN not set. Get free $5 credit: signup at replicate.com → Account → API Tokens → copy token. Add to Vercel env vars.' },
      { status: 400 }
    );
  }

  const modelKey = model || 'kling-v2';
  const modelVersion = REPLICATE_MODELS[modelKey] || REPLICATE_MODELS['kling-v2'];

  videoTasks.set(taskId, { status: 'processing', createdAt: Date.now(), provider: 'replicate' });

  // Start async creation + polling
  createReplicateVideo(apiKey, taskId, modelVersion, prompt);

  return NextResponse.json({ taskId, provider: 'replicate', model: modelKey, status: 'processing' }, { status: 202 });
}

async function createReplicateVideo(apiKey: string, localTaskId: string, model: string, prompt: string) {
  try {
    // Step 1: Create prediction
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({ model, input: { prompt } }),
    });

    if (!createRes.ok) {
      const text = await createRes.text().catch(() => '');
      videoTasks.set(localTaskId, { status: 'failed', error: `Replicate API ${createRes.status}: ${text.slice(0, 300)}`, createdAt: videoTasks.get(localTaskId)?.createdAt || Date.now(), provider: 'replicate' });
      return;
    }

    const prediction = await createRes.json();

    // If Prefer: wait returned a completed result
    if (prediction.status === 'succeeded' && prediction.output) {
      const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      videoTasks.set(localTaskId, { status: 'completed', url: videoUrl, createdAt: videoTasks.get(localTaskId)?.createdAt || Date.now(), provider: 'replicate' });
      return;
    }

    if (prediction.status === 'failed') {
      videoTasks.set(localTaskId, { status: 'failed', error: prediction.error || 'Video generation failed', createdAt: videoTasks.get(localTaskId)?.createdAt || Date.now(), provider: 'replicate' });
      return;
    }

    // Step 2: Poll if still processing
    const predictionUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
    pollReplicateVideo(apiKey, localTaskId, predictionUrl);
  } catch (err) {
    console.error('Replicate create error:', err);
    videoTasks.set(localTaskId, { status: 'failed', error: 'Failed to start video generation', createdAt: videoTasks.get(localTaskId)?.createdAt || Date.now(), provider: 'replicate' });
  }
}

async function pollReplicateVideo(apiKey: string, localTaskId: string, pollUrl: string) {
  const maxPolls = 120; // 10 minutes at 5s intervals
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const res = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!res.ok) continue;

      const data = await res.json();

      if (data.status === 'succeeded' && data.output) {
        const videoUrl = Array.isArray(data.output) ? data.output[0] : data.output;
        videoTasks.set(localTaskId, { status: 'completed', url: videoUrl, createdAt: videoTasks.get(localTaskId)?.createdAt || Date.now(), provider: 'replicate' });
        return;
      }
      if (data.status === 'failed') {
        videoTasks.set(localTaskId, { status: 'failed', error: data.error || 'Video generation failed', createdAt: videoTasks.get(localTaskId)?.createdAt || Date.now(), provider: 'replicate' });
        return;
      }
    } catch (err) {
      console.error('Replicate poll error:', err);
    }
  }
  videoTasks.set(localTaskId, { status: 'failed', error: 'Video generation timed out (10 min)', createdAt: videoTasks.get(localTaskId)?.createdAt || Date.now(), provider: 'replicate' });
}

// ─── MiniMax Provider (original) ──────────────────────────────────

function handleMiniMax(prompt: string, model: string | undefined, taskId: string) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'MINIMAX_API_KEY not set. Add it in Settings or Vercel env. Get a key at minimax.io' },
      { status: 400 }
    );
  }

  const taskId_local = crypto.randomUUID();

  // Create MiniMax video generation task
  // Using fetch directly to create the task
  fetch('https://api.minimax.chat/v1/video_generation', {
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
  })
    .then(res => {
      if (!res.ok) return res.text().then(t => { throw new Error(`MiniMax API ${res.status}: ${t.slice(0, 300)}`); });
      return res.json();
    })
    .then(data => {
      videoTasks.set(taskId, { status: 'processing', createdAt: videoTasks.get(taskId)?.createdAt || Date.now(), provider: 'minimax' });
      pollMiniMaxVideo(apiKey, taskId, data.task_id);
    })
    .catch(err => {
      videoTasks.set(taskId, { status: 'failed', error: err.message, createdAt: videoTasks.get(taskId)?.createdAt || Date.now(), provider: 'minimax' });
    });

  videoTasks.set(taskId, { status: 'processing', createdAt: Date.now(), provider: 'minimax' });
  return NextResponse.json({ taskId, provider: 'minimax', status: 'processing' }, { status: 202 });
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
        videoTasks.set(localTaskId, { status: 'completed', url: videoUrl, createdAt: videoTasks.get(localTaskId)?.createdAt || Date.now(), provider: 'minimax' });
        return;
      }
      if (status === 'Failed') {
        videoTasks.set(localTaskId, { status: 'failed', error: data.base_resp?.status_msg || 'Video generation failed', createdAt: videoTasks.get(localTaskId)?.createdAt || Date.now(), provider: 'minimax' });
        return;
      }
    } catch (err) {
      console.error('Video poll error:', err);
    }
  }
  videoTasks.set(localTaskId, { status: 'failed', error: 'Video generation timed out', createdAt: videoTasks.get(localTaskId)?.createdAt || Date.now(), provider: 'minimax' });
}
