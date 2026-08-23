/**
 * Config Validator — Round 4
 *
 * Validates all environment variables on startup.
 * Returns clear error messages for missing/invalid configs.
 * Does NOT crash the server — callers decide what to do with results.
 */

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateConfig(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Provider-specific API keys ---
  const provider = (process.env.LLM_PROVIDER || process.env.PROVIDER || '').toLowerCase();

  if (provider === 'gemini' || provider === 'google') {
    const geminiKey = process.env.GEMINI_API_KEY || '';
    if (!geminiKey) {
      errors.push('GEMINI_API_KEY is required when provider is gemini/google');
    } else if (!/^AIza[0-9A-Za-z_-]{35}$/.test(geminiKey)) {
      errors.push('GEMINI_API_KEY does not match expected pattern (AIza followed by 35 alphanumeric/underscore/dash chars)');
    }
  }

  if (provider === 'groq') {
    const groqKey = process.env.GROQ_API_KEY || '';
    if (!groqKey) {
      errors.push('GROQ_API_KEY is required when provider is groq');
    } else if (!/^gsk_[a-zA-Z0-9]{20,}$/.test(groqKey)) {
      errors.push('GROQ_API_KEY does not match expected pattern (gsk_ followed by 20+ alphanumeric chars)');
    }
  }

  // --- DATABASE_URL ---
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl) {
    const validDbPrefixes = ['sqlite:', 'sqlite3:', 'postgresql://', 'postgres://', 'mysql://', 'mysqlx://'];
    const hasValidPrefix = validDbPrefixes.some(p => dbUrl.startsWith(p));
    // Also accept file: paths for SQLite
    const isFilePath = dbUrl.startsWith('file:');
    if (!hasValidPrefix && !isFilePath) {
      errors.push(`DATABASE_URL must start with a valid database protocol (sqlite:, postgresql://, mysql://). Got: ${dbUrl.substring(0, 20)}...`);
    }
  } else {
    warnings.push('DATABASE_URL is not set — database features may not work');
  }

  // --- DATABASE_PROVIDER ---
  const dbProvider = (process.env.DATABASE_PROVIDER || '').toLowerCase();
  const validDbProviders = ['sqlite', 'postgresql', 'mysql', ''];
  if (!validDbProviders.includes(dbProvider)) {
    errors.push(`DATABASE_PROVIDER must be one of: sqlite, postgresql, mysql. Got: '${process.env.DATABASE_PROVIDER}'`);
  }

  // --- PORT ---
  const portStr = process.env.PORT || '';
  if (portStr) {
    const portNum = parseInt(portStr, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      errors.push(`PORT must be a number between 1 and 65535. Got: '${portStr}'`);
    }
  } else {
    warnings.push('PORT is not set — defaulting to 3001');
  }

  // --- LOCAL_LLM_BASE_URL ---
  const localLlmBaseUrl = process.env.LOCAL_LLM_BASE_URL || '';
  if (localLlmBaseUrl) {
    try {
      const url = new URL(localLlmBaseUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        errors.push(`LOCAL_LLM_BASE_URL must be a valid HTTP/HTTPS URL. Got: '${localLlmBaseUrl}'`);
      }
    } catch {
      errors.push(`LOCAL_LLM_BASE_URL is not a valid URL: '${localLlmBaseUrl}'`);
    }
  }

  // --- LOCAL_LLM_TIMEOUT_MS ---
  const llmTimeout = process.env.LOCAL_LLM_TIMEOUT_MS || '';
  if (llmTimeout) {
    const timeoutNum = parseInt(llmTimeout, 10);
    if (isNaN(timeoutNum) || timeoutNum <= 0) {
      errors.push(`LOCAL_LLM_TIMEOUT_MS must be a positive number. Got: '${llmTimeout}'`);
    }
  }

  // --- WAKE_WORD_ENABLED ---
  if (process.env.WAKE_WORD_ENABLED === 'true') {
    warnings.push('WAKE_WORD_ENABLED is true — microphone access will be required on the client');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export { validateConfig };
