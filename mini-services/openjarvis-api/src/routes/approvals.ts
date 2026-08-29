import { Router, Request, Response, NextFunction } from 'express';
import { approvalService } from '../approval/approvalService.js';
import { opportunityService } from '../approval/opportunityEngine.js';
import { getApprovalPolicyEngine } from '../approval/approvalPolicy.js';
import { AgentLoop } from '../agent/agentLoop.js';
import { createModelProvider } from '../agent/modelProvider.js';
import { ToolRegistry } from '../agent/toolRegistry.js';
import { createWebSearchTool } from '../agent/tools/webSearchTool.js';
import { mcpPluginManager } from '../mcp/pluginManager.js';
import { badRequest, notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ===========================================
// Approval Request Endpoints
// ===========================================

/** GET /approvals — list approval requests with optional filters */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { missionId, status } = req.query;
    const requests = await approvalService.list(
      { missionId as string | undefined, status as any },
      requestId,
    );
    res.json(requests.map(r => ({
      ...r,
      toolInput: r.toolInput ? JSON.parse(r.toolInput) : null,
    })));
  } catch (err) { next(err); }
});

/** GET /approvals/pending — list only pending approvals */
router.get('/pending', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const requests = await approvalService.listPending(requestId);
    res.json(requests.map(r => ({
      ...r,
      toolInput: r.toolInput ? JSON.parse(r.toolInput) : null,
    })));
  } catch (err) { next(err); }
});

/** GET /approvals/:id — get a single approval request */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const request = await approvalService.getById(req.params.id, requestId);
    res.json({
      ...request,
      toolInput: request.toolInput ? JSON.parse(request.toolInput) : null,
    });
  } catch (err) { next(err); }
});

/** POST /approvals/:id/approve — approve an approval request */
router.post('/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { resolvedBy } = req.body;
    const approved = await approvalService.approve(req.params.id, { resolvedBy }, requestId);
    res.json({
      ...approved,
      toolInput: approved.toolInput ? JSON.parse(approved.toolInput) : null,
    });
  } catch (err) { next(err); }
});

/** POST /approvals/:id/reject — reject an approval request */
router.post('/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { resolvedBy } = req.body;
    const rejected = await approvalService.reject(req.params.id, { resolvedBy }, requestId);
    res.json({
      ...rejected,
      toolInput: rejected.toolInput ? JSON.parse(rejected.toolInput) : null,
    });
  } catch (err) { next(err); }
});

/** POST /approvals/:id/cancel — cancel an approval request */
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const cancelled = await approvalService.cancel(req.params.id, requestId);
    res.json({
      ...cancelled,
      toolInput: cancelled.toolInput ? JSON.parse(cancelled.toolInput) : null,
    });
  } catch (err) { next(err); }
});

/** POST /approvals/:id/resume — approve + resume the mission */
router.post('/:id/resume', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { provider = 'gemini' } = req.body;

    // First approve the request
    const approved = await approvalService.approve(req.params.id, { resolvedBy: 'user' }, requestId);

    // Check if there's a pending approval for this mission
    const pending = AgentLoop.getPendingApproval(approved.missionId);
    if (!pending || pending.approvalRequestId !== req.params.id) {
      res.json({
        ...approved,
        toolInput: approved.toolInput ? JSON.parse(approved.toolInput) : null,
        resumed: false,
        message: 'No pending agent execution to resume (approval recorded only)',
      });
      return;
    }

    // Resume the agent loop
    const modelProvider = createModelProvider(provider);
    const registry = new ToolRegistry();
    registry.register(createWebSearchTool());

    // Phase 8: Load MCP tools into the resumed registry
    try {
      const mcpHandlers = await mcpPluginManager.buildToolHandlers();
      for (const handler of mcpHandlers) {
        registry.register(handler);
      }
      if (mcpHandlers.length > 0) {
        logger.info(requestId, `Loaded ${mcpHandlers.length} MCP tools into resumed agent registry`);
      }
    } catch (err: any) {
      logger.warn(requestId, `MCP tool loading failed on resume (continuing without MCP tools): ${err.message}`);
    }

    const result = await AgentLoop.resumeAfterApproval({
      missionId: approved.missionId,
      requestId,
      modelProvider,
      registry,
    });

    res.json({
      approval: {
        ...approved,
        toolInput: approved.toolInput ? JSON.parse(approved.toolInput) : null,
      },
      agentResult: {
        success: result.success,
        finalStatus: result.finalStatus,
        finalContent: result.finalContent,
        totalTokensUsed: result.totalTokensUsed,
        totalToolCalls: result.totalToolCalls,
        stagesCount: result.stages.length,
      },
      resumed: true,
    });
  } catch (err) { next(err); }
});

/** POST /approvals/cleanup — expire overdue approval requests */
router.post('/cleanup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const count = await approvalService.expireOverdue(requestId);
    res.json({ expired: count });
  } catch (err) { next(err); }
});

// ===========================================
// Opportunity Endpoints
// ===========================================

/** GET /approvals/opportunities — list opportunities with optional filters */
router.get('/opportunities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { missionId, status, type } = req.query;
    const opportunities = await opportunityService.list(
      {
        missionId: missionId as string | undefined,
        status: status as any,
        type: type as any,
      },
      requestId,
    );
    res.json(opportunities.map(o => ({
      ...o,
      actions: o.actions ? JSON.parse(o.actions) : null,
    })));
  } catch (err) { next(err); }
});

/** GET /approvals/opportunities/:id — get a single opportunity */
router.get('/opportunities/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const opp = await opportunityService.getById(req.params.id, requestId);
    res.json({
      ...opp,
      actions: opp.actions ? JSON.parse(opp.actions) : null,
    });
  } catch (err) { next(err); }
});

/** POST /approvals/opportunities/:id/acknowledge — acknowledge an opportunity */
router.post('/opportunities/:id/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const updated = await opportunityService.acknowledge(req.params.id, requestId);
    res.json({
      ...updated,
      actions: updated.actions ? JSON.parse(updated.actions) : null,
    });
  } catch (err) { next(err); }
});

/** POST /approvals/opportunities/:id/dismiss — dismiss an opportunity */
router.post('/opportunities/:id/dismiss', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const updated = await opportunityService.dismiss(req.params.id, requestId);
    res.json({
      ...updated,
      actions: updated.actions ? JSON.parse(updated.actions) : null,
    });
  } catch (err) { next(err); }
});

/** POST /approvals/opportunities/:id/act — mark opportunity as acted upon */
router.post('/opportunities/:id/act', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const updated = await opportunityService.markActedUpon(req.params.id, requestId);
    res.json({
      ...updated,
      actions: updated.actions ? JSON.parse(updated.actions) : null,
    });
  } catch (err) { next(err); }
});

// ===========================================
// Approval Policy Endpoints
// ===========================================

/** GET /approvals/policy — get current approval policy */
router.get('/policy', (_req: Request, res: Response) => {
  const engine = getApprovalPolicyEngine();
  res.json(engine.getPolicy());
});

/** PATCH /approvals/policy — update approval policy */
router.patch('/policy', (req: Request, res: Response, next: NextFunction) => {
  try {
    const engine = getApprovalPolicyEngine();
    const updated = engine.updatePolicy(req.body);
    res.json(updated);
  } catch (err) { next(err); }
});

/** GET /approvals/status — get system-wide approval/opportunity stats */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { db } = await import('../utils/db.js');
    const [pendingCount, approvedCount, rejectedCount, oppSuggestedCount] = await Promise.all([
      db.approvalRequest.count({ where: { status: 'pending' } }),
      db.approvalRequest.count({ where: { status: 'approved' } }),
      db.approvalRequest.count({ where: { status: 'rejected' } }),
      db.opportunity.count({ where: { status: 'suggested' } }),
    ]);
    const policy = getApprovalPolicyEngine().getPolicy();
    res.json({
      approvals: { pending: pendingCount, approved: approvedCount, rejected: rejectedCount },
      opportunities: { suggested: oppSuggestedCount },
      policy: {
        autoApproveRiskLevels: policy.autoApproveRiskLevels,
        hardBlockRiskLevels: policy.hardBlockRiskLevels,
        trustRepeatedToolUse: policy.trustRepeatedToolUse,
        opportunityEngineEnabled: policy.opportunityEngineEnabled,
      },
    });
  } catch (err) { next(err); }
});

export default router;
