/**
 * Model provider abstraction.
 * Both Gemini and Groq implement the same `ModelProvider` interface.
 * Swapping requires zero changes outside the adapter.
 */
import { ModelProvider, ChatMessage, ToolDefinition, ToolCall, ModelResponse } from './types.js';

// ---- Gemini Adapter ----

export class GeminiProvider implements ModelProvider {
  readonly name = 'gemini';
  private client: any;
  private modelName: string;

  constructor(apiKey: string, modelName?: string) {
    // Dynamic import to avoid issues if package is missing
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ModelResponse> {
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      ...(tools && tools.length > 0 ? {
        tools: tools.map(t => ({
          functionDeclarations: [{
            name: t.name,
            description: t.description,
            parameters: t.inputSchema as any,
          }],
        })),
      } : {}),
    });

    // Convert our ChatMessage[] to Gemini format
    const geminiHistory: any[] = [];
    let systemInstruction: string | undefined;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
      } else if (msg.role === 'tool') {
        geminiHistory.push({
          role: 'user',
          parts: [{ functionResponse: { name: msg.toolName, response: JSON.parse(msg.content) } }],
        });
      } else {
        geminiHistory.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    const startSession = async () => {
      return model.startChat({
        history: geminiHistory,
        ...(systemInstruction ? { systemInstruction } : {}),
      });
    };

    const chat = await startSession();

    // Get last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) {
      return {
        content: null,
        toolCalls: [],
        finishReason: 'error',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    const result = await chat.sendMessage(lastUserMsg.content);
    const response = result.response;

    const toolCalls: ToolCall[] = [];
    let textContent = '';

    if (response.candidates && response.candidates[0]) {
      const parts = response.candidates[0].content?.parts || [];
      for (const part of parts) {
        if (part.functionCall) {
          toolCalls.push({
            id: `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args || {},
          });
        } else if (part.text) {
          textContent += part.text;
        }
      }
    }

    // Token usage from Gemini
    const usageMeta = response.usageMetadata || {};
    const promptTokens = (usageMeta as any).promptTokenCount || 0;
    const completionTokens = (usageMeta as any).candidatesTokenCount || 0;

    return {
      content: toolCalls.length > 0 ? null : textContent || null,
      toolCalls,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }
}

// ---- Groq Adapter ----

export class GroqProvider implements ModelProvider {
  readonly name = 'groq';
  private client: any;
  private modelName: string;

  constructor(apiKey: string, modelName?: string) {
    const Groq = require('groq-sdk');
    this.client = new Groq.default(apiKey);
    this.modelName = modelName || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ModelResponse> {
    const groqMessages: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'tool') {
        groqMessages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
      } else if (msg.role === 'assistant') {
        const tool_calls = undefined; // Groq handles tool calls in the response
        groqMessages.push({ role: 'assistant', content: msg.content });
      } else {
        groqMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const params: any = {
      model: this.modelName,
      messages: groqMessages,
    };

    if (tools && tools.length > 0) {
      params.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
    }

    const response = await this.client.chat.completions.create(params);
    const choice = response.choices[0];
    const message = choice.message;

    const toolCalls: ToolCall[] = (message.tool_calls || []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}'),
    }));

    return {
      content: message.content || null,
      toolCalls,
      finishReason: choice.finish_reason === 'tool_calls' ? 'tool_calls' as const
        : choice.finish_reason === 'length' ? 'max_tokens' as const
        : 'stop' as const,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }
}

// ---- Factory ----

export function createModelProvider(
  provider: 'gemini' | 'groq',
): ModelProvider {
  switch (provider) {
    case 'gemini': {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error('GEMINI_API_KEY is not set');
      return new GeminiProvider(key);
    }
    case 'groq': {
      const key = process.env.GROQ_API_KEY;
      if (!key) throw new Error('GROQ_API_KEY is not set');
      return new GroqProvider(key);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
