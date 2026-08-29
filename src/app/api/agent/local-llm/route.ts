import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

export async function GET() {
  try {
    return Response.json({
      available: false,
      backends: ['ollama', 'lm-studio', 'mlx-vlm'],
      message: 'Local LLM not available on serverless',
    });
  } catch (err) {
    return handleError(err);
  }
}
