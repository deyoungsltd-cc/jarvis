/**
 * FallbackProvider — wraps multiple model providers in a priority chain.
 *
 * On `chat()` or `chatStream()`, tries the first provider. If it fails with
 * a transient error (timeout, 5xx, network), automatically falls back to
 * the next provider in the chain.
 *
 * Tracks which provider was used, response times, and errors for observability.
 */
import {
  ModelProvider,
  ChatMessage,
  ToolDefinition,
  ModelResponse,
  StreamChunk,
} from './types.js';
import { logger } from '../utils/logger.js';

export interface FallbackProviderConfig {
  type: 'gemini' | 'groq' | 'local';
  weight?: number;       // Higher weight = preferred (for future load balancing)
  maxRetries?: number;   // Max retries for this specific provider before falling back
}

interface ProviderEntry {
  provider: ModelProvider;
  config: FallbackProviderConfig;
  maxRetries: number;
}

interface ProviderHealth {
  name: string;
  type: string;
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

interface FallbackStats {
  providerUsed: string;
  providerIndex: number;
  responseTimeMs: number;
  errors: Array<{ provider: string; error: string; timestamp: Date }>;
  fallbackOccurred: boolean;
}

function isTransientError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  // Network / timeout errors
  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('abort') ||
    msg.includes('socket hang up')
  ) return true;
  // HTTP 5xx
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
  // Rate limits (429)
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('too many requests')) return false; // handled separately
  return false;
}

function isRateLimitError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests')
  );
}

export class FallbackProvider implements ModelProvider {
  readonly name = 'fallback';
  private providers: ProviderEntry[] = [];
  private lastStats: FallbackStats | null = null;

  constructor(configs: FallbackProviderConfig[], providerInstances: ModelProvider[]) {
    for (let i = 0; i < configs.length; i++) {
      if (providerInstances[i]) {
        this.providers.push({
          provider: providerInstances[i],
          config: configs[i],
          maxRetries: configs[i].maxRetries ?? 1,
        });
      }
    }
    logger.info('-', `FallbackProvider initialized with ${this.providers.length} provider(s): ${this.providers.map(p => p.config.type).join(' → ')}`);
  }

  /**
   * Try each provider in order. On transient error, fall back to the next.
   * Rate limit errors trigger a short delay then retry the same provider once.
   */
  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ModelResponse> {
    const errors: FallbackStats['errors'] = [];

    for (let i = 0; i < this.providers.length; i++) {
      const entry = this.providers[i];
      const providerName = entry.provider.name;
      let retriesLeft = entry.maxRetries;

      while (retriesLeft >= 0) {
        const start = Date.now();
        try {
          logger.info('-', `FallbackProvider: trying ${providerName} (attempt ${entry.maxRetries - retriesLeft + 1}/${entry.maxRetries + 1})`);
          const response = await entry.provider.chat(messages, tools);
          const elapsed = Date.now() - start;

          this.lastStats = {
            providerUsed: providerName,
            providerIndex: i,
            responseTimeMs: elapsed,
            errors,
            fallbackOccurred: i > 0 || (entry.maxRetries - retriesLeft) > 0,
          };

          if (i > 0 || (entry.maxRetries - retriesLeft) > 0) {
            logger.info('-', `FallbackProvider: succeeded with ${providerName} after ${elapsed}ms (fallback: ${i > 0 ? 'yes' : 'no'}, retries: ${entry.maxRetries - retriesLeft})`);
          }

          return response;
        } catch (err: any) {
          const elapsed = Date.now() - start;
          errors.push({ provider: providerName, error: err.message || String(err), timestamp: new Date() });
          logger.warn('-', `FallbackProvider: ${providerName} failed after ${elapsed}ms: ${err.message || String(err)}`);

          if (isRateLimitError(err) && retriesLeft > 0) {
            // Wait for retry-after or default 5s
            const waitMs = 5000;
            logger.info('-', `FallbackProvider: rate limited by ${providerName}, waiting ${waitMs}ms before retry`);
            await new Promise(r => setTimeout(r, waitMs));
            retriesLeft--;
            continue;
          }

          if (isTransientError(err) && retriesLeft > 0) {
            retriesLeft--;
            continue;
          }

          // Non-transient or out of retries — fall back to next provider
          break;
        }
      }
    }

    // All providers exhausted
    const lastError = errors[errors.length - 1]?.error || 'All providers failed';
    logger.error('-', `FallbackProvider: ALL providers failed. Last error: ${lastError}`);
    this.lastStats = { providerUsed: 'none', providerIndex: -1, responseTimeMs: 0, errors, fallbackOccurred: true };

    return {
      content: null,
      toolCalls: [],
      finishReason: 'error',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  /**
   * Streaming variant — tries providers in order, yields chunks from
   * the first one that succeeds.
   */
  async *chatStream(messages: ChatMessage[], tools?: ToolDefinition[]): AsyncGenerator<StreamChunk> {
    const errors: FallbackStats['errors'] = [];

    for (let i = 0; i < this.providers.length; i++) {
      const entry = this.providers[i];
      const providerName = entry.provider.name;

      try {
        logger.info('-', `FallbackProvider (stream): trying ${providerName}`);
        const start = Date.now();

        // If the provider has native streaming, use it
        if (entry.provider.chatStream) {
          const gen = entry.provider.chatStream(messages, tools);
          let gotContent = false;
          try {
            for await (const chunk of gen) {
              gotContent = true;
              if (chunk.type === 'done') {
                this.lastStats = {
                  providerUsed: providerName,
                  providerIndex: i,
                  responseTimeMs: Date.now() - start,
                  errors,
                  fallbackOccurred: i > 0,
                };
              }
              yield chunk;
            }
            return; // Success — done
          } catch (err: any) {
            if (gotContent) {
              // We already started streaming, can't fall back — just yield error
              yield { type: 'error', data: { message: err.message || String(err), provider: providerName } };
              return;
            }
            errors.push({ provider: providerName, error: err.message || String(err), timestamp: new Date() });
            logger.warn('-', `FallbackProvider (stream): ${providerName} stream failed: ${err.message || String(err)}`);
            continue; // Try next provider
          }
        }

        // No native streaming — fall back to non-streaming chat, then simulate streaming
        const response = await entry.provider.chat(messages, tools);
        this.lastStats = {
          providerUsed: providerName,
          providerIndex: i,
          responseTimeMs: Date.now() - start,
          errors,
          fallbackOccurred: i > 0,
        };

        if (response.content) {
          // Simulate streaming by yielding word-by-word
          const words = response.content.split(/(\s+)/);
          for (const word of words) {
            yield { type: 'chunk', data: { text: word } };
          }
        }

        yield { type: 'done', data: { usage: response.usage, finishReason: response.finishReason } };
        return; // Success
      } catch (err: any) {
        errors.push({ provider: providerName, error: err.message || String(err), timestamp: new Date() });
        logger.warn('-', `FallbackProvider (stream): ${providerName} failed: ${err.message || String(err)}`);
        continue; // Try next provider
      }
    }

    // All providers failed
    logger.error('-', `FallbackProvider (stream): ALL providers failed`);
    yield { type: 'error', data: { message: 'All providers failed', errors } };
  }

  /**
   * Health check — tests all configured providers and returns their status.
   */
  async healthCheck(): Promise<ProviderHealth[]> {
    const results: ProviderHealth[] = [];

    for (const entry of this.providers) {
      const start = Date.now();
      try {
        // Send a minimal chat request to test connectivity
        await entry.provider.chat(
          [{ role: 'user', content: 'ping' }],
          undefined,
        );
        results.push({
          name: entry.provider.name,
          type: entry.config.type,
          healthy: true,
          latencyMs: Date.now() - start,
        });
      } catch (err: any) {
        results.push({
          name: entry.provider.name,
          type: entry.config.type,
          healthy: false,
          latencyMs: Date.now() - start,
          error: err.message || String(err),
        });
      }
    }

    logger.info('-', `FallbackProvider health check: ${results.filter(r => r.healthy).length}/${results.length} healthy`);
    return results;
  }

  /** Get stats from the last chat/chatStream call */
  getLastStats(): FallbackStats | null {
    return this.lastStats;
  }

  /** Get the ordered list of configured provider names */
  getProviderNames(): string[] {
    return this.providers.map(p => p.provider.name);
  }
}
