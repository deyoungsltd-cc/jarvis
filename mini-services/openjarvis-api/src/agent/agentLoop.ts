/**
 * Agent Loop — the core execution engine with error recovery.
 *
 * Implements every state from Section 4.1 as real code paths:
 *   interpret → context retrieval → plan → risk/permission check →
 *   select tool → execute → observe → verify → update memory/state →
 *   continue/adapt/escalate → complete
 *
 * Error recovery (Feature 3):
 *   - Network errors → retry with exponential backoff (2s, 4s, 8s)
 *   - Provider errors → try next provider if using fallback
 *   - Rate limits → wait and retry (respects Retry-After concept)
 *   - Invalid model response → log and continue loop (ask model to try again)
 *   - Database errors → best-effort, don't crash the mission
 *   - Circuit breaker: 5 consecutive same-step errors → force-complete
 *   - Never throws — always returns an AgentResult
 *
 * Includes budget/iteration caps (runaway-cost guard).
 */
import {
  ChatMessage,
  ModelProvider,
  ModelResponse,
  AgentLoopStage,
  AgentLoopOptions,
  ToolDefinition,
} from './types.js';
import { ToolRegistry } from './toolRegistry.js';
import { MissionStateMachine } from './missionStateMachine.js';
import { missionService } from '../services/missionService.js';
import { missionEventService } from '../services/missionEventService.js';
import { memoryService } from '../services/memoryService.js';
import { buildMemoryContext } from './memory/contextBuilder.js';
import { checkApprovalGate, waitForApprovalDecision } from '../services/approvalGate.js';
import { logger } from '../utils/logger.js';

const SYSTEM_PROMPT = `You are an autonomous AI agent. You receive a goal from the user and must accomplish it using the tools available to you.

Your workflow for each step:
1. Understand what the user wants
2. Decide if you need to use a tool or if you can answer directly
3. If you need a tool, call it with the appropriate arguments
4. Analyze the tool's output
5. Decide if you have enough information to complete the goal, or if you need more steps
6. When done, provide a clear summary of what you found/did

Be concise and efficient. Use the minimum number of tool calls needed.`;

/** Max consecutive errors on the same step before circuit breaker fires */
const CIRCUIT_BREAKER_THRESHOLD = 5;

/** Backoff delays for retries: 2s, 4s, 8s */
const BACKOFF_DELAYS = [2000, 4000, 8000];

export interface AgentResult {
  success: boolean;
  finalContent: string | null;
  stages: Array<{
    stage: AgentLoopStage;
    timestamp: Date;
    payload?: unknown;
  }>;
  totalTokensUsed: number;
  totalToolCalls: number;
  finalStatus: string;
}

/** Classify an error for retry strategy */
function classifyError(err: any): 'network' | 'rate_limit' | 'provider' | 'invalid_response' | 'database' | 'unknown' {
  if (!err) return 'unknown';
  const msg = (err.message || String(err)).toLowerCase();

  // Database errors
  if (
    msg.includes('prisma') ||
    msg.includes('database') ||
    msg.includes('sql') ||
    msg.includes('unique constraint') ||
    msg.includes('sqlite') ||
    msg.includes('postgres') ||
    msg.includes('mysql')
  ) return 'database';

  // Rate limits
  if (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests')
  ) return 'rate_limit';

  // Network errors
  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('abort') ||
    msg.includes('socket hang up') ||
    msg.includes('epipe')
  ) return 'network';

  // Provider API errors (5xx)
  if (
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('api key') ||
    msg.includes('api_error') ||
    msg.includes('invalid api')
  ) return 'provider';

  // Invalid model responses
  if (
    msg.includes('no content') ||
    msg.includes('empty response') ||
    msg.includes('invalid json') ||
    msg.includes('malformed')
  ) return 'invalid_response';

  return 'unknown';
}

export class AgentLoop {
  private options: AgentLoopOptions;
  private model: ModelProvider;
  private registry: ToolRegistry;
  private messages: ChatMessage[] = [];
  private stages: AgentResult['stages'] = [];
  private totalTokensUsed = 0;
  private totalToolCalls = 0;
  private consecutiveErrors = 0;
  private lastErrorType: string | null = null;

  constructor(options: AgentLoopOptions, registry: ToolRegistry) {
    this.options = options;
    this.model = options.modelProvider;
    this.registry = registry;
  }

  /** Run the full agent loop until completion, error, or budget exceeded.
   *  Never throws — always returns an AgentResult. */
  async run(): Promise<AgentResult> {
    const { missionId, goal, requestId, maxIterations, maxTokenBudget, maxRetries = 3 } = this.options;

    logger.info(requestId, `Agent loop starting for mission ${missionId} (maxRetries: ${maxRetries})`);

    // ---- Top-level error recovery ----
    // The entire run() is wrapped in a retry loop for transient errors.
    let runAttempts = 0;
    while (runAttempts <= maxRetries) {
      try {
        return await this._runInner(requestId, missionId, goal, maxIterations, maxTokenBudget, maxRetries);
      } catch (err: any) {
        runAttempts++;
        const errorType = classifyError(err);

        logger.warn(requestId, `Agent loop top-level error (attempt ${runAttempts}/${maxRetries + 1}): [${errorType}] ${err.message || String(err)}`);

        if (errorType === 'database') {
          // Database errors — best effort, don't retry aggressively
          logger.warn(requestId, 'Database error in agent loop — continuing with degraded functionality');
          // Don't retry, just return what we have
          return this.buildResult(false, 'failed', null, 'Database error during execution');
        }

        if (errorType === 'rate_limit' && runAttempts <= maxRetries) {
          const waitMs = 5000 * runAttempts; // 5s, 10s, 15s
          logger.info(requestId, `Rate limited — waiting ${waitMs}ms before retry`);
          await this.safeSleep(waitMs);
          continue;
        }

        if ((errorType === 'network' || errorType === 'provider') && runAttempts <= maxRetries) {
          const backoffIdx = Math.min(runAttempts - 1, BACKOFF_DELAYS.length - 1);
          const waitMs = BACKOFF_DELAYS[backoffIdx];
          logger.info(requestId, `Transient ${errorType} error — waiting ${waitMs}ms before retry`);
          await this.safeSleep(waitMs);
          continue;
        }

        // Unknown or unrecoverable error — return failure result
        logger.error(requestId, `Agent loop unrecoverable error: ${err.message || String(err)}`);
        return this.buildResult(false, 'failed', null, err.message || String(err));
      }
    }

    // Should not reach here, but just in case
    return this.buildResult(false, 'failed', null, 'Max retries exceeded');
  }

  private async _runInner(
    requestId: string,
    missionId: string,
    goal: string,
    maxIterations: number,
    maxTokenBudget: number,
    maxRetries: number,
  ): Promise<AgentResult> {
    // Transition: draft/queued → running
    const mission = await this.safeDbOp(
      () => missionService.getById(missionId, requestId),
      requestId,
      'get mission for status transition',
    );
    if (!mission) {
      return this.buildResult(false, 'failed', null, `Mission ${missionId} not found`);
    }

    const newStatus = await this.safeDbOp(
      () => {
        const ns = MissionStateMachine.transition(mission.status, 'running');
        return missionService.update(missionId, { status: ns }, requestId).then(() => ns);
      },
      requestId,
      'transition mission to running',
    );

    await this.recordStage('interpret', { goal });

    // Build initial messages
    let systemPrompt = SYSTEM_PROMPT;

    // Phase 6: context_retrieval — build memory context
    await this.recordStage('context_retrieval', { goal });
    try {
      const memCtx = await buildMemoryContext({
        goal,
        missionId,
        requestId,
      });
      if (memCtx.entryCount > 0) {
        systemPrompt += `\n\nRelevant context from your memory:\n${memCtx.contextString}`;
        logger.info(requestId, `Injected ${memCtx.entryCount} memories into context`);
      }
    } catch (err: any) {
      logger.warn(requestId, `Memory context build failed (non-fatal): ${err.message}`);
    }

    this.messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: goal },
    ];

    // Main loop
    let iteration = 0;
    while (iteration < maxIterations) {
      iteration++;
      logger.info(requestId, `Agent iteration ${iteration}/${maxIterations}`);

      // Budget check
      if (this.totalTokensUsed >= maxTokenBudget) {
        await this.recordStage('budget_exceeded', {
          totalTokensUsed: this.totalTokensUsed,
          maxTokenBudget,
        });
        await this.safeSetMissionStatus(missionId, 'blocked', requestId);
        return this.buildResult(false, 'blocked');
      }

      // Circuit breaker check
      if (this.consecutiveErrors >= CIRCUIT_BREAKER_THRESHOLD) {
        logger.error(requestId, `Circuit breaker triggered: ${CIRCUIT_BREAKER_THRESHOLD} consecutive errors. Force-completing mission.`);
        await this.recordStage('error', {
          message: `Circuit breaker: ${CIRCUIT_BREAKER_THRESHOLD} consecutive errors on the same step. Force-completing.`,
          lastErrorType: this.lastErrorType,
        });
        await this.safeSetMissionStatus(missionId, 'failed', requestId);
        return this.buildResult(
          false,
          'failed',
          `The agent encountered repeated errors (${this.lastErrorType}) and was unable to continue. The mission has been force-completed. Please try again or simplify your request.`,
        );
      }

      // Call the model with error recovery
      const toolDefs = this.registry.getToolDefinitions();
      const response = await this.callModelWithRetry(
        requestId,
        toolDefs.length > 0 ? toolDefs : undefined,
        maxRetries,
      );

      // If response indicates total failure (all providers exhausted), force-complete
      if (response.finishReason === 'error' && !response.content && response.toolCalls.length === 0) {
        logger.error(requestId, 'Model returned error with no content or tool calls');
        this.consecutiveErrors++;
        this.lastErrorType = 'provider_error';

        // Ask model to try again (if we haven't exceeded circuit breaker)
        if (this.consecutiveErrors < CIRCUIT_BREAKER_THRESHOLD) {
          this.messages.push({
            role: 'assistant',
            content: 'I encountered an error processing your request. Let me try a different approach.',
          });
          this.messages.push({
            role: 'user',
            content: 'The previous attempt failed with an error. Please try again with a simpler approach or explain what you need differently.',
          });
          continue;
        }
      }

      // Reset consecutive error counter on successful model call
      if (response.finishReason !== 'error') {
        this.consecutiveErrors = 0;
        this.lastErrorType = null;
      }

      // Track token usage (best-effort DB update)
      this.totalTokensUsed += response.usage.totalTokens;
      await this.safeDbOp(
        () => missionService.update(missionId, {
          tokenUsage: this.totalTokensUsed,
          toolCallCount: this.totalToolCalls,
        }, requestId),
        requestId,
        'update mission token count',
      );

      // Handle tool calls
      if (response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          this.totalToolCalls++;

          // Budget check on tool calls
          const currentMission = await this.safeDbOp(
            () => missionService.getById(missionId, requestId),
            requestId,
            'get mission for tool budget check',
          );
          if (currentMission && this.totalToolCalls > currentMission.maxToolCalls) {
            await this.recordStage('budget_exceeded', {
              reason: 'tool_call_limit',
              totalToolCalls: this.totalToolCalls,
              maxToolCalls: currentMission.maxToolCalls,
            });
            await this.safeSetMissionStatus(missionId, 'blocked', requestId);
            return this.buildResult(false, 'blocked');
          }

          await this.recordStage('tool_select', { toolName: toolCall.name, arguments: toolCall.arguments });

          // Phase 10: Approval gate
          const toolHandler = this.registry.get(toolCall.name);
          const toolRisk = toolHandler?.riskLevel || 'medium';
          const toolCapability = this._getCapabilityForTool(toolCall.name);

          const gateResult = await this.safeDbOp(
            () => checkApprovalGate({
              toolName: toolCall.name,
              riskLevel: toolRisk,
              capability: toolCapability,
              toolInput: toolCall.arguments,
              missionId,
              requestId,
            }),
            requestId,
            'check approval gate',
          );

          if (!gateResult) {
            // DB error on approval check — skip this tool call and let the model try again
            logger.warn(requestId, `Approval gate check failed (DB error), skipping tool '${toolCall.name}'`);
            this.messages.push({
              role: 'tool',
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              content: JSON.stringify({ error: 'Approval check failed due to database error. Skipping this tool call.' }),
            });
            continue;
          }

          if (!gateResult.proceed && gateResult.status === 'waiting_approval') {
            await this.recordStage('risk_check', {
              toolName: toolCall.name,
              riskLevel: toolRisk,
              approvalId: gateResult.approvalId,
              reason: gateResult.reason,
            });

            await this.safeSetMissionStatus(missionId, 'waiting_approval', requestId);
            logger.info(requestId, `Mission ${missionId} waiting for approval of tool '${toolCall.name}'`);

            const decision = await this.safeDbOp(
              () => waitForApprovalDecision(gateResult.approvalId!, requestId),
              requestId,
              'wait for approval decision',
            );

            if (decision === 'approved') {
              await this.safeSetMissionStatus(missionId, 'running', requestId);
              logger.info(requestId, `Mission ${missionId} resumed after approval for tool '${toolCall.name}'`);
              await this.recordStage('tool_execute', { toolName: toolCall.name, approved: true });
            } else {
              const failReason = decision === 'rejected' ? 'Tool call rejected by user'
                : decision === 'expired' ? 'Approval request expired'
                : 'Approval request cancelled';
              await this.recordStage('observe', {
                toolName: toolCall.name,
                success: false,
                error: failReason,
                approvalDecision: decision,
              });
              this.messages.push({
                role: 'tool',
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                content: JSON.stringify({ error: failReason, approvalDecision: decision }),
              });
              const currentM = await this.safeDbOp(
                () => missionService.getById(missionId, requestId),
                requestId,
                'check mission status after approval',
              );
              if (currentM && currentM.status === 'waiting_approval') {
                await this.safeSetMissionStatus(missionId, 'running', requestId);
              }
              continue;
            }
          } else if (!gateResult.proceed && gateResult.status === 'blocked') {
            await this.recordStage('risk_check', {
              toolName: toolCall.name,
              riskLevel: toolRisk,
              blocked: true,
              reason: gateResult.reason,
            });
            await this.recordStage('observe', {
              toolName: toolCall.name,
              success: false,
              error: gateResult.reason,
            });
            this.messages.push({
              role: 'tool',
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              content: JSON.stringify({ error: gateResult.reason }),
            });
            continue;
          } else {
            await this.recordStage('tool_execute', { toolName: toolCall.name });
          }

          // Execute the tool
          const result = await this.registry.executeTool(toolCall.name, toolCall.arguments, {
            missionId,
            requestId,
          });

          await this.recordStage('observe', {
            toolName: toolCall.name,
            success: result.success,
            error: result.error,
            durationMs: result.durationMs,
          });

          // Add tool call and result to conversation
          this.messages.push({
            role: 'assistant',
            content: `Calling tool: ${toolCall.name}`,
          });
          this.messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            content: JSON.stringify(result.success ? result.output : { error: result.error }),
          });

          // Update mission counters (best-effort)
          await this.safeDbOp(
            () => missionService.update(missionId, {
              toolCallCount: this.totalToolCalls,
              tokenUsage: this.totalTokensUsed,
            }, requestId),
            requestId,
            'update mission counters after tool execution',
          );
        }
        continue;
      }

      // No tool calls — model produced final content
      if (response.content) {
        await this.recordStage('verify', { content: response.content });

        // Phase 6: Enhanced memory_update
        await this.recordStage('memory_update', {
          scope: 'episodic',
          key: `mission_${missionId}_result`,
        });

        const goalTokens = goal.toLowerCase().split(/\s+/).slice(0, 5);
        await this.safeDbOp(
          () => memoryService.create({
            scope: 'episodic',
            key: `mission_${missionId}_result`,
            value: {
              goal: this.options.goal,
              result: response.content,
              tokensUsed: this.totalTokensUsed,
              toolCalls: this.totalToolCalls,
            },
            tags: goalTokens,
            missionId,
            source: 'agent',
            importance: 3,
          }),
          requestId,
          'store episodic memory result',
        );

        await this.recordStage('complete', { content: response.content });
        await this.safeSetMissionStatus(missionId, 'completed', requestId);

        this.messages.push({ role: 'assistant', content: response.content });
        return this.buildResult(true, 'completed', response.content);
      }

      // Model returned nothing — this is an invalid response
      logger.warn(requestId, 'Model returned no content and no tool calls (invalid response)');
      this.consecutiveErrors++;
      this.lastErrorType = 'invalid_response';

      if (this.consecutiveErrors < CIRCUIT_BREAKER_THRESHOLD) {
        // Ask the model to try again
        this.messages.push({
          role: 'user',
          content: 'Your previous response was empty. Please provide a proper response or use a tool to accomplish the goal.',
        });
        await this.recordStage('adapt', { reason: 'empty_response', consecutiveErrors: this.consecutiveErrors });
        continue;
      }

      // Circuit breaker will catch this on next iteration
    }

    // Max iterations reached
    await this.recordStage('budget_exceeded', {
      reason: 'max_iterations',
      iterations: iteration,
      maxIterations,
    });
    await this.safeSetMissionStatus(missionId, 'blocked', requestId);
    return this.buildResult(false, 'blocked');
  }

  /**
   * Call the model with retry logic for transient errors.
   * Handles network errors, rate limits, and provider errors.
   */
  private async callModelWithRetry(
    requestId: string,
    tools: ToolDefinition[] | undefined,
    maxRetries: number,
  ): Promise<ModelResponse> {
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.model.chat(this.messages, tools);
      } catch (err: any) {
        lastError = err;
        const errorType = classifyError(err);

        logger.warn(requestId, `Model call error (attempt ${attempt + 1}/${maxRetries + 1}): [${errorType}] ${err.message || String(err)}`);

        // Database errors — don't retry model calls for DB issues
        if (errorType === 'database') {
          logger.error(requestId, `Database error during model call: ${err.message}`);
          break;
        }

        // Rate limit — wait then retry
        if (errorType === 'rate_limit' && attempt < maxRetries) {
          const waitMs = 5000 * (attempt + 1);
          logger.info(requestId, `Rate limited — waiting ${waitMs}ms before model retry`);
          await this.safeSleep(waitMs);
          continue;
        }

        // Network or provider error — exponential backoff retry
        if ((errorType === 'network' || errorType === 'provider') && attempt < maxRetries) {
          const backoffIdx = Math.min(attempt, BACKOFF_DELAYS.length - 1);
          const waitMs = BACKOFF_DELAYS[backoffIdx];
          logger.info(requestId, `Transient ${errorType} error — waiting ${waitMs}ms before model retry`);
          await this.safeSleep(waitMs);
          continue;
        }

        // Non-retryable or out of retries
        break;
      }
    }

    // All retries failed — return error response (don't throw)
    logger.error(requestId, `All model call retries failed: ${lastError?.message || 'unknown error'}`);
    return {
      content: null,
      toolCalls: [],
      finishReason: 'error',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  /**
   * Wrapper for database operations that catches errors and returns null.
   * Prevents DB errors from crashing the mission.
   */
  private async safeDbOp<T>(
    fn: () => Promise<T>,
    requestId: string,
    operation: string,
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (err: any) {
      logger.warn(requestId, `Database operation '${operation}' failed (non-fatal): ${err.message || String(err)}`);
      return null;
    }
  }

  /** Set mission status with error handling */
  private async safeSetMissionStatus(missionId: string, targetStatus: string, requestId: string) {
    await this.safeDbOp(async () => {
      const mission = await missionService.getById(missionId, requestId);
      if (!mission) return;
      const newStatus = MissionStateMachine.transition(mission.status, targetStatus);
      await missionService.update(missionId, { status: newStatus }, requestId);
    }, requestId, `set mission status to ${targetStatus}`);
  }

  /** Non-throwing sleep */
  private safeSleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async recordStage(stage: AgentLoopStage, payload?: unknown) {
    const entry = { stage, timestamp: new Date(), payload };
    this.stages.push(entry);
    await missionEventService.create({
      missionId: this.options.missionId,
      type: stage,
      payload,
    }, this.options.requestId).catch(() => {}); // best effort
  }

  /** Map tool name to its required capability (for permission-gated tools) */
  private _getCapabilityForTool(toolName: string): string | undefined {
    const toolCapabilityMap: Record<string, string> = {
      filesystem_delete: 'filesystem_delete',
      shell_execute: 'shell_execute',
      filesystem_read: 'filesystem_read',
      filesystem_write: 'filesystem_write',
      mouse_click: 'mouse_click',
      key_type: 'key_type',
      key_press: 'key_press',
      clipboard_read: 'clipboard_read',
      clipboard_write: 'clipboard_write',
      app_launch: 'app_launch',
      app_close: 'app_close',
      window_focus: 'window_focus',
    };
    return toolCapabilityMap[toolName];
  }

  private buildResult(success: boolean, finalStatus: string, finalContent: string | null = null, errorMessage?: string): AgentResult {
    return {
      success,
      finalContent,
      stages: this.stages,
      totalTokensUsed: this.totalTokensUsed,
      totalToolCalls: this.totalToolCalls,
      finalStatus,
      ...(errorMessage ? { errorMessage } : {}),
    };
  }
}
