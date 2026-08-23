import { Router, Request, Response, NextFunction } from 'express';
import { missionService } from '../services/missionService.js';
import { createModelProvider } from '../agent/modelProvider.js';
import { ToolRegistry } from '../agent/toolRegistry.js';
import { createWebSearchTool } from '../agent/tools/webSearchTool.js';
import { AgentLoop } from '../agent/agentLoop.js';
import { badRequest } from '../utils/errors.js';
import { ChatMessage } from '../agent/types.js';
import { createSSEStream, streamToSSE, simulateStream } from '../agent/streamingUtils.js';

const router = Router();

/** Valid provider names for the /agent endpoints */
const validProviders = ['gemini', 'groq', 'local', 'fallback'] as const;

type ValidProvider = typeof validProviders[number];

/** POST /agent/run — execute a mission through the agent loop */
router.post('/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { missionId, provider = 'fallback' } = req.body;

    if (!missionId) {
      throw badRequest('VALIDATION_ERROR', 'missionId is required', requestId);
    }

    if (!(validProviders as readonly string[]).includes(provider)) {
      throw badRequest('VALIDATION_ERROR', `Invalid provider '${provider}'. Must be: ${validProviders.join(', ')}`, requestId);
    }

    // Load the mission
    const mission = await missionService.getById(missionId, requestId);
    if (mission.status !== 'draft' && mission.status !== 'queued') {
      throw badRequest(
        'INVALID_MISSION_STATUS',
        `Mission status must be 'draft' or 'queued' to run, got '${mission.status}'`,
        requestId,
      );
    }

    // Create model provider
    const modelProvider = createModelProvider(provider as ValidProvider);

    // Create tool registry with the web_search tool
    const registry = new ToolRegistry();
    registry.register(createWebSearchTool());

    // Create and run the agent loop
    const agent = new AgentLoop(
      {
        missionId,
        goal: mission.goal,
        modelProvider,
        maxIterations: mission.maxToolCalls,
        maxTokenBudget: mission.budget,
        requestId,
      },
      registry,
    );

    const result = await agent.run();

    res.json({
      success: result.success,
      finalStatus: result.finalStatus,
      finalContent: result.finalContent,
      totalTokensUsed: result.totalTokensUsed,
      totalToolCalls: result.totalToolCalls,
      stagesCount: result.stages.length,
    });
  } catch (err) { next(err); }
});

/**
 * POST /agent/chat/stream — streaming chat endpoint (SSE)
 *
 * Accepts: { messages: ChatMessage[], provider?: string, missionId?: string }
 * Returns: SSE stream with events:
 *   data: {"type":"chunk","text":"word"}
 *   data: {"type":"done","usage":{...},"finishReason":"stop"}
 *   data: {"type":"error","message":"..."}
 */
router.post('/chat/stream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { messages, provider = 'fallback', missionId } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw badRequest('VALIDATION_ERROR', 'messages array is required', requestId);
    }

    if (!(validProviders as readonly string[]).includes(provider)) {
      throw badRequest('VALIDATION_ERROR', `Invalid provider '${provider}'. Must be: ${validProviders.join(', ')}`, requestId);
    }

    // Set up SSE
    createSSEStream(res);

    // Create provider
    const modelProvider = createModelProvider(provider as ValidProvider);

    // If the provider has native streaming, use it
    if (modelProvider.chatStream) {
      const generator = modelProvider.chatStream(messages as ChatMessage[]);
      await streamToSSE(generator, res);
      return;
    }

    // No native streaming — call chat() and simulate streaming
    try {
      const response = await modelProvider.chat(messages as ChatMessage[]);

      if (response.content) {
        // Simulate word-by-word streaming
        for await (const chunk of simulateStream(response.content)) {
          if (res.writableEnded || res.destroyed) break;
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk.data?.text || '' })}\n\n`);
        }
      }

      // Send done event
      res.write(`data: ${JSON.stringify({ type: 'done', usage: response.usage, finishReason: response.finishReason })}\n\n`);
      res.end();
    } catch (err: any) {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message || 'Chat failed' })}\n\n`);
        res.end();
      }
    }
  } catch (err) { next(err); }
});

/** GET /agent/transitions — get valid state transitions */
router.get('/transitions', (_req: Request, res: Response) => {
  const { MissionStateMachine } = require('../agent/missionStateMachine.js');
  const transitions: Record<string, string[]> = {};
  for (const status of ['draft','queued','running','waiting_approval','paused','blocked','failed','completed','cancelled','expired']) {
    transitions[status] = MissionStateMachine.getAllowedTransitions(status);
  }
  res.json(transitions);
});

export default router;
