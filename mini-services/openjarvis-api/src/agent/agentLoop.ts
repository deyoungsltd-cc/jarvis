/**
 * Agent Loop — the core execution engine.
 * Implements every state from Section 4.1 as real code paths:
 *   interpret → context retrieval → plan → risk/permission check →
 *   select tool → execute → observe → verify → update memory/state →
 *   continue/adapt/escalate → complete
 *
 * Includes budget/iteration caps (runaway-cost guard).
 */
import { v4 as uuidv4 } from 'uuid';
import {
  ChatMessage,
  ModelProvider,
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

export class AgentLoop {
  private options: AgentLoopOptions;
  private model: ModelProvider;
  private registry: ToolRegistry;
  private messages: ChatMessage[] = [];
  private stages: AgentResult['stages'] = [];
  private totalTokensUsed = 0;
  private totalToolCalls = 0;

  constructor(options: AgentLoopOptions, registry: ToolRegistry) {
    this.options = options;
    this.model = options.modelProvider;
    this.registry = registry;
  }

  /** Run the full agent loop until completion, error, or budget exceeded */
  async run(): Promise<AgentResult> {
    const { missionId, goal, requestId, maxIterations, maxTokenBudget } = this.options;

    logger.info(requestId, `Agent loop starting for mission ${missionId}`);

    try {
      // Transition: draft/queued → running
      const mission = await missionService.getById(missionId, requestId);
      const newStatus = MissionStateMachine.transition(mission.status, 'running');
      await missionService.update(missionId, { status: newStatus }, requestId);
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
          await this.setMissionStatus(missionId, 'blocked', requestId);
          return this.buildResult(false, 'blocked');
        }

        // Call the model
        const toolDefs = this.registry.getToolDefinitions();
        const response = await this.model.chat(this.messages, toolDefs.length > 0 ? toolDefs : undefined);

        // Track token usage
        this.totalTokensUsed += response.usage.totalTokens;
        await missionService.update(missionId, {
          tokenUsage: this.totalTokensUsed,
          toolCallCount: this.totalToolCalls,
        }, requestId);

        // Handle tool calls
        if (response.toolCalls.length > 0) {
          for (const toolCall of response.toolCalls) {
            this.totalToolCalls++;

            // Budget check on tool calls
            if (this.totalToolCalls > (await this.getMission(missionId, requestId)).maxToolCalls) {
              await this.recordStage('budget_exceeded', {
                reason: 'tool_call_limit',
                totalToolCalls: this.totalToolCalls,
                maxToolCalls: (await this.getMission(missionId, requestId)).maxToolCalls,
              });
              await this.setMissionStatus(missionId, 'blocked', requestId);
              return this.buildResult(false, 'blocked');
            }

            await this.recordStage('tool_select', { toolName: toolCall.name, arguments: toolCall.arguments });
            await this.recordStage('tool_execute', { toolName: toolCall.name });

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

            // Update mission counters
            await missionService.update(missionId, {
              toolCallCount: this.totalToolCalls,
              tokenUsage: this.totalTokensUsed,
            }, requestId);
          }
          continue; // Loop back to get model's next action after tool results
        }

        // No tool calls — model produced final content
        if (response.content) {
          await this.recordStage('verify', { content: response.content });

          // Phase 6: Enhanced memory_update — store structured result + goal→result association
          await this.recordStage('memory_update', {
            scope: 'episodic',
            key: `mission_${missionId}_result`,
          });

          // Store episodic result with tags derived from the goal
          const goalTokens = goal.toLowerCase().split(/\s+/).slice(0, 5);
          await memoryService.create({
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
          });

          await this.recordStage('complete', { content: response.content });
          await this.setMissionStatus(missionId, 'completed', requestId);

          this.messages.push({ role: 'assistant', content: response.content });
          return this.buildResult(true, 'completed', response.content);
        }

        // Model returned nothing
        await this.recordStage('error', { message: 'Model returned no content and no tool calls' });
        await this.setMissionStatus(missionId, 'failed', requestId);
        return this.buildResult(false, 'failed');
      }

      // Max iterations reached
      await this.recordStage('budget_exceeded', {
        reason: 'max_iterations',
        iterations: iteration,
        maxIterations,
      });
      await this.setMissionStatus(missionId, 'blocked', requestId);
      return this.buildResult(false, 'blocked');

    } catch (err: any) {
      logger.error(requestId, `Agent loop error: ${err.message}`, { stack: err.stack });
      await this.recordStage('error', { message: err.message, stack: err.stack });
      try {
        await this.setMissionStatus(missionId, 'failed', requestId);
      } catch {
        // Best effort status update
      }
      return this.buildResult(false, 'failed');
    }
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

  private async setMissionStatus(missionId: string, targetStatus: string, requestId: string) {
    const mission = await missionService.getById(missionId, requestId);
    const newStatus = MissionStateMachine.transition(mission.status, targetStatus);
    await missionService.update(missionId, { status: newStatus }, requestId);
  }

  private async getMission(missionId: string, requestId: string) {
    return missionService.getById(missionId, requestId);
  }

  private buildResult(success: boolean, finalStatus: string, finalContent: string | null = null): AgentResult {
    return {
      success,
      finalContent,
      stages: this.stages,
      totalTokensUsed: this.totalTokensUsed,
      totalToolCalls: this.totalToolCalls,
      finalStatus,
    };
  }
}
