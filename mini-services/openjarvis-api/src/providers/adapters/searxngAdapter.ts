/**
 * SearXNG Search Adapter — Phase 14
 *
 * Self-hosted, genuinely $0 per query, unlimited.
 * Falls back to when Tavily monthly quota is exhausted.
 */
import { SearchProvider, SearchResult } from '../types.js';

export class SearxngAdapter implements SearchProvider {
  readonly name = 'searxng';
  readonly capability = 'search' as const;
  readonly isFree = true;

  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // remove trailing slash
  }

  async healthCheck() {
    if (!this.baseUrl) return { healthy: false, error: 'SEARXNG_BASE_URL not set' };
    try {
      const res = await fetch(`${this.baseUrl}/search?q=test&format=json&categories=general`, {
        signal: AbortSignal.timeout(5000),
      });
      return { healthy: res.ok, error: res.ok ? undefined : `SearXNG returned ${res.status}` };
    } catch (err: any) {
      return { healthy: false, error: err.message };
    }
  }

  async search(query: string, options?: { numResults?: number }): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      categories: 'general',
    });

    const response = await fetch(`${this.baseUrl}/search?${params}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`SearXNG error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as any;

    return (data.results || []).slice(0, options?.numResults || 10).map((r: any) => ({
      url: r.url,
      title: r.title,
      snippet: r.content || '',
      source: 'searxng',
    }));
  }
}
