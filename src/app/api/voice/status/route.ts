import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    provider: process.env.VOICE_PROVIDER || 'browser',
    language: process.env.VOICE_LANGUAGE || 'en-US',
    ttsVoice: process.env.VOICE_TTS_VOICE || null,
    sttModel: process.env.VOICE_STT_MODEL || null,
    available: true,
  });
}