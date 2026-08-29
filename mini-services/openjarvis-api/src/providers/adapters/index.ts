/**
 * Built-in provider adapter factory.
 * Creates provider instances from env vars and config.
 */
import { TavilyAdapter } from './tavilyAdapter.js';
import { SearxngAdapter } from './searxngAdapter.js';
import { CapabilityCategory, BaseProvider, LLMProvider, SearchProvider } from '../types.js';
import { GeminiProvider, GroqProvider } from '../../agent/modelProvider.js';

export function createBuiltinProvider(capability: CapabilityCategory, name: string, config: Record<string, unknown>): BaseProvider | null {
  switch (capability) {
    case 'search': {
      if (name === 'tavily') {
        const key = (config.envKey ? process.env[config.envKey as string] : process.env.TAVILY_API_KEY) as string;
        if (!key) return null;
        return new TavilyAdapter(key);
      }
      if (name === 'searxng') {
        const url = (config.envKey ? process.env[config.envKey as string] : process.env.SEARXNG_BASE_URL) as string;
        if (!url) return null;
        return new SearxngAdapter(url);
      }
      break;
    }
    case 'llm': {
      if (name === 'gemini') {
        const key = (config.envKey ? process.env[config.envKey as string] : process.env.GEMINI_API_KEY) as string;
        if (!key) return null;
        return new GeminiProvider(key, config.defaultModel as string) as unknown as BaseProvider;
      }
      if (name === 'groq') {
        const key = (config.envKey ? process.env[config.envKey as string] : process.env.GROQ_API_KEY) as string;
        if (!key) return null;
        return new GroqProvider(key, config.defaultModel as string) as unknown as BaseProvider;
      }
      break;
    }
    default:
      // Other capabilities (voice, avatar, wake_word) are initialized by their own modules
      return null;
  }
  return null;
}
