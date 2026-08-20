import { Router, Request, Response, NextFunction } from 'express';
import { LocalLLMProvider } from '../agent/localLLMProvider.js';

const router = Router();

/**
 * GET /agent/local-llm/health
 *
 * Probe for any running local LLM server (Ollama, LM Studio, mlx-vlm, etc.)
 * and report its status, backend name, and loaded models.
 */
router.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Create provider without baseUrl to trigger full auto-detection
    const provider = new LocalLLMProvider();
    const health = await provider.healthCheck();

    res.json({
      provider: 'local',
      ...health,
    });
  } catch (err) { next(err); }
});

/**
 * GET /agent/local-llm/status
 *
 * Return the current local LLM configuration without probing.
 */
router.get('/status', (_req: Request, res: Response) => {
  const configuredUrl = process.env.LOCAL_LLM_BASE_URL || '';
  const configuredModel = process.env.LOCAL_LLM_MODEL || '';

  res.json({
    provider: 'local',
    configuredBaseUrl: configuredUrl || '(auto-detect)',
    configuredModel: configuredModel || '(auto-detect from server)',
    temperature: process.env.LOCAL_LLM_TEMPERATURE || '0.7',
    maxTokens: process.env.LOCAL_LLM_MAX_TOKENS || '4096',
    timeoutMs: process.env.LOCAL_LLM_TIMEOUT_MS || '300000',
    autoProbeOrder: [
      { backend: 'Ollama',    port: 11434, url: 'http://localhost:11434/v1' },
      { backend: 'LM Studio', port: 1234,  url: 'http://localhost:1234/v1' },
      { backend: 'mlx-vlm',  port: 8080,  url: 'http://localhost:8080/v1' },
    ],
    supportedBackends: {
      ollama: {
        platforms: ['Windows', 'Linux', 'macOS'],
        install: {
          Windows: 'Download from https://ollama.com',
          Linux: 'curl -fsSL https://ollama.com/install.sh | sh',
          macOS: 'brew install ollama  OR  https://ollama.com',
        },
        defaultPort: 11434,
        start: {
          Windows: '.\mini-services\local-llm\start-server.ps1',
          'Linux/macOS': './mini-services/local-llm/start-server.sh',
        },
      },
      'lm-studio': {
        platforms: ['Windows', 'macOS', 'Linux'],
        install: 'Download from https://lmstudio.ai',
        defaultPort: 1234,
        note: 'GUI app — load a model and start the local server from the UI.',
      },
      'mlx-vlm': {
        platforms: ['macOS (Apple Silicon only)'],
        install: 'pip install -U mlx-vlm',
        defaultPort: 8080,
        note: 'Optimized for Apple Silicon Metal. Auto-selected on arm64 Macs if installed.',
      },
    },
    quickStart: {
      '1_install': 'Install Ollama from https://ollama.com (works on Windows, Linux, macOS)',
      '2_pull_model': 'ollama pull qwen2.5:32b',
      '3_start_server': 'cd mini-services/local-llm && ./start-server.sh  (or .\start-server.ps1 on Windows)',
      '4_run_jarvis': 'POST /agent/run { "missionId": "...", "provider": "local" }',
      '5_health_check': 'GET /agent/local-llm/health',
    },
  });
});

export default router;