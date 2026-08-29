/**
 * Tavily Search Adapter — Phase 14
 *
 * Free tier: 1,000 searches/month. Purpose-built for LLM agent consumption.
 */
import { SearchProvider, SearchResult } from '../types.js';
import { logger } from '../../utils/logger.js';

export class TavilyAdapter implements SearchProvider {
  readonly name = 'tavily';
  readonly capability = 'search' as const;
  readonly isFree = true;

  private apiKey: string;
  private baseUrl = 'https://api.tavily.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async healthCheck() {
    if (!this.apiKey) return { healthy: false, error: 'TAVILY_API_KEY not set' };
    return { healthy: true };
  }

  async search(query: string, options?: { numResults?: number }): Promise<SearchResult[]> {
    const numResults = Math.min(options?.numResults || 5, 10);

    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: numResults,
        include_answer: false,
      }),
    });

    if (response.status === 429) {
      throw new Error('Tavily rate limit exceeded (429). Monthly quota may be exhausted.');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tavily API error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;

    return (data.results || []).map((r: any) => ({
      url: r.url,
      title: r.title,
      snippet: r.content,
      source: 'tavily',
    }));
  }
}
