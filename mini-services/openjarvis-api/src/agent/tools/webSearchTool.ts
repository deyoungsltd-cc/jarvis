/**
 * web_search tool — the first real tool in the registry.
 * Uses z-ai-web-dev-sdk for actual web search.
 */
import { ToolHandler, ToolExecutionResult } from '../types.js';

export function createWebSearchTool(): ToolHandler {
  return {
    name: 'web_search',
    description: 'Search the web for current information. Returns a list of results with titles, URLs, and snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        num: { type: 'number', description: 'Number of results to return (1-20, default 5)' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              name: { type: 'string' },
              snippet: { type: 'string' },
              host_name: { type: 'string' },
            },
          },
        },
        totalResults: { type: 'number' },
      },
    },
    riskLevel: 'low',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const query = input.query as string;
      const num = Math.min(Math.max((input.num as number) || 5, 1), 20);

      try {
        // Use z-ai-web-dev-sdk for search
        const ZAI = (await import('z-ai-web-dev-sdk')).default;
        const zai = await ZAI.create();
        const results = await zai.functions.invoke('web_search', { query, num });

        return {
          success: true,
          output: {
            results: (results || []).map((r: any) => ({
              url: r.url,
              name: r.name,
              snippet: r.snippet,
              host_name: r.host_name,
            })),
            totalResults: (results || []).length,
          },
          durationMs: 0, // set by registry
        };
      } catch (err: any) {
        return {
          success: false,
          output: null,
          error: String(err.message || err),
          durationMs: 0,
        };
      }
    },
  };
}
