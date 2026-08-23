/**
 * Database Configuration Module
 *
 * Supports three database backends: SQLite, PostgreSQL, and MySQL.
 * Reads DATABASE_PROVIDER env var and validates DATABASE_URL accordingly.
 *
 * NOTE: Prisma does NOT support dynamic provider switching at runtime.
 * The `provider` field in schema.prisma is a build-time setting.
 * To switch databases:
 *   1. Change `provider` in prisma/schema.prisma to "postgresql" or "mysql"
 *   2. Set DATABASE_URL to the correct connection string
 *   3. Run `npx prisma generate` to regenerate the client
 *   4. Run `npx prisma db push` to sync the schema
 */

import { logger } from './logger.js';

export type DatabaseProviderType = 'sqlite' | 'postgresql' | 'mysql';

export interface DatabaseConfig {
  provider: DatabaseProviderType;
  url: string;
  providerName: string;
}

const VALID_PROVIDERS: DatabaseProviderType[] = ['sqlite', 'postgresql', 'mysql'];

const DEFAULT_URLS: Record<DatabaseProviderType, string> = {
  sqlite: 'file:./prisma/dev.db',
  postgresql: 'postgresql://postgres:postgres@localhost:5432/openjarvis',
  mysql: 'mysql://root:root@localhost:3306/openjarvis',
};

const PROVIDER_DISPLAY_NAMES: Record<DatabaseProviderType, string> = {
  sqlite: 'SQLite',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
};

const URL_PATTERNS: Record<DatabaseProviderType, RegExp> = {
  sqlite: /^file:/i,
  postgresql: /^postgresql:\/\//i,
  mysql: /^mysql:\/\//i,
};

/**
 * Validates a DATABASE_URL for the given provider.
 * Returns an error message if invalid, or null if valid.
 */
function validateUrl(provider: DatabaseProviderType, url: string): string | null {
  if (!url || url.trim().length === 0) {
    return `DATABASE_URL is empty for provider '${provider}'`;
  }
  const pattern = URL_PATTERNS[provider];
  if (!pattern.test(url)) {
    return `DATABASE_URL '${url}' does not match expected format for ${PROVIDER_DISPLAY_NAMES[provider]}. Expected prefix: ${provider === 'sqlite' ? 'file:' : provider + '://'}`;
  }
  return null;
}

/**
 * Get the validated database configuration.
 * Reads DATABASE_PROVIDER and DATABASE_URL from environment.
 * Logs the active provider on startup.
 */
export function getDatabaseConfig(): DatabaseConfig {
  const rawProvider = (process.env.DATABASE_PROVIDER || 'sqlite').toLowerCase().trim();

  if (!VALID_PROVIDERS.includes(rawProvider as DatabaseProviderType)) {
    const errMsg = `Invalid DATABASE_PROVIDER '${rawProvider}'. Must be one of: ${VALID_PROVIDERS.join(', ')}. Defaulting to 'sqlite'.`;
    logger.warn('-', errMsg);
  }

  const provider = (VALID_PROVIDERS.includes(rawProvider as DatabaseProviderType)
    ? rawProvider
    : 'sqlite') as DatabaseProviderType;

  // Use DATABASE_URL from env if set, otherwise use the default for the provider
  const url = process.env.DATABASE_URL || DEFAULT_URLS[provider];

  // Validate the URL
  const urlError = validateUrl(provider, url);
  if (urlError) {
    logger.error('-', `Database configuration error: ${urlError}`);
    logger.warn('-', `Falling back to default URL for ${provider}: ${DEFAULT_URLS[provider]}`);
    // Use the default URL as a fallback but keep the provider
    process.env.DATABASE_URL = DEFAULT_URLS[provider];
  }

  const config: DatabaseConfig = {
    provider,
    url: urlError ? DEFAULT_URLS[provider] : url,
    providerName: PROVIDER_DISPLAY_NAMES[provider],
  };

  logger.info('-', `Database provider: ${config.providerName} (${config.provider})`);
  logger.info('-', `Database URL: ${config.url.replace(/:([^:@]+)@/, ':****@')}`); // Mask password in logs

  return config;
}
