/**
 * Core types for the Agent Runtime.
 */

// ---- Model Provider Types ----

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ModelResponse {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'max_tokens' | 'error';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * The interface every model provider must implement.
 * Swapping Gemini <-> Groq requires no changes outside the adapter.
 */
export interface ModelProvider {
  readonly name: string;
  chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ModelResponse>;
}

// ---- Mission State Machine Types ----

export const VALID_STATUSES = [
  'draft',
  'queued',
  'running',
  'waiting_approval',
  'paused',
  'blocked',
  'failed',
  'completed',
  'cancelled',
  'expired',
] as const;

export type MissionStatus = (typeof VALID_STATUSES)[number];

/**
 * Valid state transitions. Key = current state, Value = array of allowed next states.
 */
export const VALID_TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  draft:            ['queued', 'cancelled'],
  queued:           ['running', 'cancelled'],
  running:          ['waiting_approval', 'paused', 'blocked', 'failed', 'completed', 'cancelled'],
  waiting_approval: ['running', 'paused', 'blocked', 'failed', 'cancelled'],
  paused:           ['running', 'cancelled'],
  blocked:          ['queued', 'cancelled'], // blocked can be retried
  failed:           ['queued', 'cancelled'], // failed can be retried
  completed:        [], // terminal
  cancelled:        [], // terminal
  expired:          [], // terminal
};

// ---- Tool Registry Types ----

export interface ToolHandler {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  execute: (input: Record<string, unknown>) => Promise<ToolExecutionResult>;
}

export interface ToolExecutionResult {
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

// ---- Agent Loop Types ----

export type AgentLoopStage =
  | 'interpret'
  | 'context_retrieval'
  | 'plan'
  | 'risk_check'
  | 'tool_select'
  | 'tool_execute'
  | 'observe'
  | 'verify'
  | 'memory_update'
  | 'adapt'
  | 'escalate'
  | 'complete'
  | 'error'
  | 'budget_exceeded';

export interface AgentLoopOptions {
  missionId: string;
  goal: string;
  modelProvider: ModelProvider;
  maxIterations: number;
  maxTokenBudget: number;
  requestId: string;
}
