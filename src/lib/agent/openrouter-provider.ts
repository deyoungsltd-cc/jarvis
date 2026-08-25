/**
 * OpenRouter provider — uncensored AI via openrouter.ai
 * Supports any model on OpenRouter including free uncensored ones.
 */
import { ModelProvider, ChatMessage, ToolDefinition, ModelResponse, ToolCall } from './types';

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

export class OpenRouterProvider implements ModelProvider {
  readonly name = 'openrouter';
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, modelName?: string) {
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
    this.apiKey = apiKey;
    this.modelName = modelName || process.env.OPENROUTER_MODEL || 'nousresearch/hermes-3-llama-3.1-70b:free';
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ModelResponse> {
    const apiMessages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: any[] }> = [];

    for (const msg of messages) {
      if (msg.role === 'tool') {
        apiMessages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId || '',
          content: msg.content,
        });
      } else {
        apiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: Record<string, unknown> = {
      model: this.modelName,
      messages: apiMessages,
      max_tokens: 4096,
      temperature: 0.7,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
    }

    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://jarvis-liard-nine.vercel.app',
        'X-Title': 'OpenJARVIS',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter API ${res.status}: ${text}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('OpenRouter returned no choices');

    const msg = choice.message;
    const toolCalls: ToolCall[] = (msg.tool_calls || []).map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: typeof tc.function.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : tc.function.arguments || {},
    }));

    const usage = data.usage || {};
    return {
      content: msg.content || null,
      toolCalls,
      finishReason: choice.finish_reason === 'tool_calls' ? 'tool_calls'
        : choice.finish_reason === 'length' ? 'max_tokens'
        : 'stop',
      usage: {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
      },
    };
  }

  /** Streaming chat — returns raw fetch Response for SSE parsing */
  async chatStream(messages: ChatMessage[]): Promise<Response> {
    const apiMessages: Array<{ role: string; content: string; tool_call_id?: string }> = [];
    for (const msg of messages) {
      if (msg.role === 'tool') {
        apiMessages.push({ role: 'tool', tool_call_id: msg.toolCallId || '', content: msg.content });
      } else {
        apiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://jarvis-liard-nine.vercel.app',
        'X-Title': 'OpenJARVIS',
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: apiMessages,
        max_tokens: 4096,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter API ${res.status}: ${text}`);
    }

    return res;
  }
}

export function createOpenRouterProvider(modelName?: string): OpenRouterProvider {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');
  return new OpenRouterProvider(key, modelName);
}
