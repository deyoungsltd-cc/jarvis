import { Router, Request, Response, NextFunction } from 'express';
import { missionService } from '../services/missionService.js';
import { createModelProvider } from '../agent/modelProvider.js';
import { ToolRegistry } from '../agent/toolRegistry.js';
import { createWebSearchTool } from '../agent/tools/webSearchTool.js';
import { AgentLoop } from '../agent/agentLoop.js';
import { badRequest } from '../utils/errors.js';

const router = Router();

/** POST /agent/run — execute a mission through the agent loop */
router.post('/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { missionId, provider = 'gemini' } = req.body;

    if (!missionId) {
      throw badRequest('VALIDATION_ERROR', 'missionId is required', requestId);
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
    const modelProvider = createModelProvider(provider);

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
