/**
 * Local LLM Provider — connects to any OpenAI-compatible local server.
 *
 * Supported backends (all produce the same /v1/chat/completions API):
 *   - Ollama      (Windows / Linux / macOS) — default, auto-detected on port 11434
 *   - LM Studio    (Windows / macOS)         — detected on port 1234
 *   - mlx-vlm      (macOS Apple Silicon)     — detected on port 8080
 *   - llama-server (any)                      — manual LOCAL_LLM_BASE_URL
 *   - vLLM         (Linux)                   — manual LOCAL_LLM_BASE_URL
 *
 * Auto-detection: if LOCAL_LLM_BASE_URL is not set, probes common ports
 * in order (Ollama → LM Studio → mlx-vlm) and connects to the first live one.
 *
 * Zero external SDK dependency — uses raw fetch.
 */
import { ModelProvider, ChatMessage, ToolDefinition, ToolCall, ModelResponse } from './types.js';
import { logger } from '../utils/logger.js';

/** Well-known local LLM server ports to auto-probe */
const AUTO_PROBE_ENDPOINTS = [
  { name: 'Ollama',    url: 'http://localhost:11434/v1',  defaultModel: '' },           // Ollama uses model name as-is
  { name: 'LM Studio', url: 'http://localhost:1234/v1',  defaultModel: 'loaded-model' },
  { name: 'mlx-vlm',  url: 'http://localhost:8080/v1',   defaultModel: 'local-qwen' },
];

export class LocalLLMProvider implements ModelProvider {
  readonly name = 'local';
  private baseUrl: string;
  private modelName: string;
  private timeoutMs: number;
  private backendName: string;

  constructor(baseUrl?: string, modelName?: string, timeoutMs?: number) {
    this.timeoutMs = timeoutMs || parseInt(process.env.LOCAL_LLM_TIMEOUT_MS || '300000', 10);
    this.modelName = modelName || process.env.LOCAL_LLM_MODEL || '';
    this.backendName = 'manual';

    if (baseUrl) {
      this.baseUrl = baseUrl.replace(/\/+$/, '');
      this.backendName = 'custom';
    } else if (process.env.LOCAL_LLM_BASE_URL) {
      this.baseUrl = process.env.LOCAL_LLM_BASE_URL.replace(/\/+$/, '');
      // Infer backend name from URL
      if (this.baseUrl.includes('11434')) this.backendName = 'Ollama';
      else if (this.baseUrl.includes('1234')) this.backendName = 'LM Studio';
      else if (this.baseUrl.includes('8080')) this.backendName = 'mlx-vlm';
    }
    // If still no baseUrl, we'll auto-detect on first call (lazy probe)
    else {
      this.baseUrl = '';
    }

    logger.info('-', `LocalLLMProvider initialized (backend: ${this.backendName}, timeout: ${this.timeoutMs}ms)`);
  }

  /**
   * Auto-detect a running local LLM server by probing common ports.
   * Called lazily on first chat() if no explicit URL was configured.
   * Returns the detected base URL or throws.
   */
  private async _autoDetect(): Promise<string> {
    logger.info('-', 'Auto-detecting local LLM server...');

    for (const endpoint of AUTO_PROBE_ENDPOINTS) {
      try {
        const res = await fetch(`${endpoint.url}/models`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const body = await res.json();
          const models: string[] = (body.data || []).map((m: any) => m.id);
          this.backendName = endpoint.name;
          logger.info('-', `Detected ${endpoint.name} at ${endpoint.url} with models: ${models.join(', ') || 'none'} (will use configured model name)`);

          // Auto-set model name from first available model if not configured
          if (!this.modelName && models.length > 0) {
            this.modelName = models[0];
            logger.info('-', `Auto-selected model: ${this.modelName}`);
          }

          return endpoint.url;
        }
      } catch {
        // Not reachable, try next
      }
    }

    throw new Error(
      'No local LLM server detected. Started probing: ' +
      AUTO_PROBE_ENDPOINTS.map(e => `${e.name} (${e.url})`).join(', ') +
      '.\nStart a server first:\n' +
      '  Windows:  .\mini-services\local-llm\start-server.ps1\n' +
      '  Linux:    ./mini-services/local-llm/start-server.sh\n' +
      '  macOS:    ./mini-services/local-llm/start-server.sh\n' +
      'Or set LOCAL_LLM_BASE_URL env var manually.'
    );
  }

  /**
   * Health check — verifies the local server is reachable and lists its models.
   * Call this before relying on the local provider.
   */
  async healthCheck(): Promise<{ ok: boolean; backend?: string; models?: string[]; baseUrl?: string; error?: string; latencyMs: number }> {
    const start = Date.now();
    try {
      const url = this.baseUrl || await this._autoDetect();
      const res = await fetch(`${url}/models`, {
        signal: AbortSignal.timeout(10000),
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}`, baseUrl: url, latencyMs };
      }
      const body = await res.json();
      const models: string[] = (body.data || []).map((m: any) => m.id);
      return { ok: true, backend: this.backendName, models, baseUrl: url, latencyMs };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Connection refused', latencyMs: Date.now() - start };
    }
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ModelResponse> {
    // Lazy auto-detect on first call
    if (!this.baseUrl) {
      this.baseUrl = await this._autoDetect();
    }

    if (!this.modelName) {
      throw new Error('LOCAL_LLM_MODEL is not set and no model was auto-detected. Set LOCAL_LLM_MODEL or ensure the server has models loaded.');
    }

    // Build OpenAI-compatible messages array
    const oaMessages: any[] = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        oaMessages.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'tool') {
        oaMessages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
      } else if (msg.role === 'assistant') {
        oaMessages.push({ role: 'assistant', content: msg.content || null });
      } else {
        oaMessages.push({ role: 'user', content: msg.content });
      }
    }

    const params: Record<string, unknown> = {
      model: this.modelName,
      messages: oaMessages,
      temperature: parseFloat(process.env.LOCAL_LLM_TEMPERATURE || '0.7'),
      max_tokens: parseInt(process.env.LOCAL_LLM_MAX_TOKENS || '4096', 10),
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
      params.tool_choice = 'auto';
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorBody = await res.text().catch(() => 'unknown');
        throw new Error(`Local LLM server (${this.backendName}) returned HTTP ${res.status}: ${errorBody.substring(0, 300)}`);
      }

      const body = await res.json();
      const choice = body.choices?.[0];
      const message = choice?.message;

      if (!message) {
        return {
          content: null, toolCalls: [], finishReason: 'error',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }

      const toolCalls: ToolCall[] = (message.tool_calls || []).map((tc: any) => ({
        id: tc.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: tc.function?.name || tc.name,
        arguments: typeof tc.function?.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function?.arguments || {},
      }));

      const promptTokens = body.usage?.prompt_tokens || 0;
      const completionTokens = body.usage?.completion_tokens || 0;
      const elapsedMs = Date.now() - startTime;

      logger.info('-', `Local LLM (${this.backendName}) response: ${elapsedMs}ms, ${completionTokens} tokens, ${toolCalls.length} tool calls`);

      return {
        content: toolCalls.length > 0 ? null : (message.content || null),
        toolCalls,
        finishReason: choice.finish_reason === 'tool_calls' ? 'tool_calls' as const
          : choice.finish_reason === 'length' ? 'max_tokens' as const
          : 'stop' as const,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Local LLM request timed out after ${this.timeoutMs}ms. The model may be overloaded or the server not running.`);
      }
      throw err;
    }
  }
}
