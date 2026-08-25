import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/generate/image
 * Supports:
 *   - OpenRouter image models (flux, stable diffusion, etc.)
 *   - MiniMax image generation
 * 
 * Body: { prompt, model?, provider? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const { prompt, model, provider } = await req.json();
    if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

    const useProvider = provider || 'openrouter';

    if (useProvider === 'minimax') {
      return await generateWithMiniMax(prompt, model);
    }
    // Default: OpenRouter
    return await generateWithOpenRouter(prompt, model);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Image generation failed';
    console.error('Image gen error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function generateWithOpenRouter(prompt: string, model?: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY not set. Add it in Settings or Vercel env.' }, { status: 400 });
  }

  // Use a free image model by default, or whatever the user specified
  const imageModel = model || 'black-forest-labs/flux-1.1-pro';

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://jarvis-liard-nine.vercel.app',
      'X-Title': 'OpenJARVIS',
    },
    body: JSON.stringify({
      model: imageModel,
      messages: [{
        role: 'user',
        content: `Generate an image: ${prompt}. Return only the image URL, nothing else.`,
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Extract image URL from response
  const urlMatch = content.match(/https?:\/\/[^\s)"']+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s]*)?/i);
  if (urlMatch) {
    return NextResponse.json({ url: urlMatch[0], model: imageModel, provider: 'openrouter' });
  }

  // If no URL found, return the raw content (some models return markdown)
  return NextResponse.json({ content, model: imageModel, provider: 'openrouter' });
}

async function generateWithMiniMax(prompt: string, model?: string) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'MINIMAX_API_KEY not set. Add it in Settings or Vercel env.' }, { status: 400 });
  }

  const res = await fetch('https://api.minimax.chat/v1/text_chat/completions_pro', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'MiniMax-Text-01',
      messages: [{
        role: 'user',
        content: `Generate a detailed image description for: ${prompt}. Return a detailed prompt suitable for image generation.`,
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MiniMax ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return NextResponse.json({
    content: data.choices?.[0]?.message?.content,
    model: model || 'MiniMax-Text-01',
    provider: 'minimax',
  });
}
