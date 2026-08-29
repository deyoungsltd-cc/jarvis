/**
 * Qwen API provider — uses DashScope OpenAI-compatible endpoint.
 * Works on Vercel serverless (no local server needed).
 *
 * Get your API key: https://dashscope.console.aliyun.com/
 * Free tier: millions of tokens for Qwen models.
 */
import { ModelProvider, ChatMessage, ToolDefinition, ModelResponse, ToolCall } from './types';

const QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export class QwenProvider implements ModelProvider {
  readonly name = 'qwen';
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, modelName?: string) {
    if (!apiKey) throw new Error('QWEN_API_KEY is not set');
    this.apiKey = apiKey;
    // Default: Qwen3.8-27B is the "brain" model. Qwen3-32B also available.
    this.modelName = modelName || process.env.QWEN_MODEL || 'qwen3.8-27b';
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

    const res = await fetch(`${QWEN_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Qwen API ${res.status}: ${text}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('Qwen API returned no choices');
    }

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
}

export function createQwenProvider(): QwenProvider {
  const key = process.env.QWEN_API_KEY;
  if (!key) throw new Error('QWEN_API_KEY is not set. Get one free at https://dashscope.console.aliyun.com/');
  return new QwenProvider(key);
}
