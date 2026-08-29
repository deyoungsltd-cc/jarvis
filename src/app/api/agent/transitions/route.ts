import { db } from '@/lib/api/db';
import { handleError } from '@/lib/api/errors';

const transitions: Record<string, string[]> = {
  draft: ['queued', 'running', 'failed', 'cancelled'],
  queued: ['running', 'failed', 'cancelled'],
  running: ['waiting_approval', 'paused', 'blocked', 'completed', 'failed', 'cancelled'],
  waiting_approval: ['running', 'paused', 'blocked', 'failed', 'cancelled'],
  paused: ['running', 'failed', 'cancelled'],
  blocked: ['running', 'failed', 'cancelled'],
  completed: [],
  failed: ['queued', 'draft', 'cancelled'],
  cancelled: ['queued', 'draft'],
  expired: ['queued', 'draft'],
};

export async function GET() {
  try {
    return Response.json(transitions);
  } catch (err) {
    return handleError(err);
  }
}
