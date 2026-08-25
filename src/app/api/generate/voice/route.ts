import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/generate/voice
 * Text-to-speech with voice cloning support
 * Body: { text, voiceId?, model? }
 * 
 * Providers:
 *   - elevenlabs (default) — best quality, supports voice cloning
 *   - minimax — TTS via MiniMax
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const { text, voiceId, model, provider } = await req.json();
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });

    const useProvider = provider || 'elevenlabs';

    if (useProvider === 'minimax') {
      return await generateWithMiniMax(text, voiceId);
    }
    return await generateWithElevenLabs(text, voiceId, model);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Voice generation failed';
    console.error('Voice gen error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function generateWithElevenLabs(text: string, voiceId?: string, model?: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ELEVENLABS_API_KEY not set. Add it in Settings or Vercel env. Get a key at elevenlabs.io' },
      { status: 400 }
    );
  }

  const voice = voiceId || 'pNInz6obpgDQGcFmaJgB'; // Adam — default voice
  const ttsModel = model || 'eleven_multilingual_v2';

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: ttsModel,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status}: ${errText.slice(0, 200)}`);
  }

  // Return audio as base64 for easy playback in browser
  const audioBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(audioBuffer).toString('base64');

  return NextResponse.json({
    audio: `data:audio/mpeg;base64,${base64}`,
    format: 'mp3',
    provider: 'elevenlabs',
    voice: voice,
  });
}

async function generateWithMiniMax(text: string, voiceId?: string) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'MINIMAX_API_KEY not set. Add it in Settings or Vercel env.' },
      { status: 400 }
    );
  }

  const res = await fetch('https://api.minimax.chat/v1/t2a_v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'speech-01',
      text,
      timber_weights: [{
        voice_id: voiceId || 'male-qn-qingse',
        weight: 1,
      }],
      audio_setting: {
        sample_rate: 32000,
        format: 'mp3',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`MiniMax TTS ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const audioBase64 = data.data?.audio;
  if (!audioBase64) throw new Error('No audio returned from MiniMax');

  return NextResponse.json({
    audio: `data:audio/mpeg;base64,${audioBase64}`,
    format: 'mp3',
    provider: 'minimax',
    voice: voiceId || 'male-qn-qingse',
  });
}

/**
 * GET /api/generate/voice — list available voices
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const provider = new URL(req.url).searchParams.get('provider') || 'elevenlabs';

  try {
    if (provider === 'elevenlabs') {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) return NextResponse.json({ voices: [], note: 'ELEVENLABS_API_KEY not set' });

      const res = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': apiKey },
      });
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
      const data = await res.json();
      return NextResponse.json({
        voices: data.voices?.map((v: any) => ({
          id: v.voice_id,
          name: v.name,
          category: v.category,
          labels: v.labels,
          preview: v.preview_url,
        })) || [],
        provider: 'elevenlabs',
      });
    }

    if (provider === 'minimax') {
      return NextResponse.json({
        voices: [
          { id: 'male-qn-qingse', name: 'Qingse (Male)', category: 'premade' },
          { id: 'female-shaonv', name: 'Shaonv (Female)', category: 'premade' },
          { id: 'female-yujie', name: 'Yujie (Female)', category: 'premade' },
          { id: 'male-qn-jingying', name: 'Jingying (Male)', category: 'premade' },
          { id: 'presenter_male', name: 'Presenter (Male)', category: 'premade' },
          { id: 'presenter_female', name: 'Presenter (Female)', category: 'premade' },
          { id: 'audiobook_male_1', name: 'Audiobook (Male)', category: 'premade' },
          { id: 'audiobook_female_1', name: 'Audiobook (Female)', category: 'premade' },
          { id: 'narrator_male', name: 'Narrator (Male)', category: 'premade' },
          { id: 'narrator_female', name: 'Narrator (Female)', category: 'premade' },
        ],
        provider: 'minimax',
      });
    }

    return NextResponse.json({ voices: [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch voices';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
