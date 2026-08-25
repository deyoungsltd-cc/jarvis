import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/generate/image
 * Uses OpenRouter's image generation endpoint for supported models,
 * or falls back to chat-based image models.
 * 
 * Body: { prompt, model? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const { prompt, model } = await req.json();
    if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not set. Add it in Vercel env vars.' }, { status: 400 });
    }

    const imageModel = model || 'black-forest-labs/flux-1.1-pro';

    // Use OpenRouter image generation endpoint
    const res = await fetch('https://openrouter.ai/api/v1/image/generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://jarvis-liard-nine.vercel.app',
        'X-Title': 'OpenJARVIS',
      },
      body: JSON.stringify({
        model: imageModel,
        prompt,
        n: 1,
        size: '1024x1024',
      }),
    });

    // If image endpoint not supported, fall back to chat completions
    if (res.status === 404 || res.status === 422) {
      return await generateViaChat(apiKey, prompt, imageModel);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;

    if (imageUrl) {
      const url = imageUrl.startsWith('data:') ? imageUrl : imageUrl;
      return NextResponse.json({ url, model: imageModel, provider: 'openrouter' });
    }

    // Fallback: try chat-based approach
    return await generateViaChat(apiKey, prompt, imageModel);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Image generation failed';
    console.error('Image gen error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Fallback: use chat completions with an image-capable model
 * Some models on OpenRouter can generate images through chat
 */
async function generateViaChat(apiKey: string, prompt: string, model: string) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://jarvis-liard-nine.vercel.app',
      'X-Title': 'OpenJARVIS',
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: `Generate an image of: ${prompt}. Return only the image URL in markdown format: ![image](URL)`,
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Extract image URL from markdown or plain URL
  const mdMatch = content.match(/!\[.*?\]\((https?:\/\/[^)\s]+)\)/);
  if (mdMatch) {
    return NextResponse.json({ url: mdMatch[1], model, provider: 'openrouter' });
  }

  const urlMatch = content.match(/https?:\/\/[^\s)"']+/i);
  if (urlMatch) {
    return NextResponse.json({ url: urlMatch[0], model, provider: 'openrouter' });
  }

  // Return text content if no image URL found
  return NextResponse.json({ content, model, provider: 'openrouter' });
}
