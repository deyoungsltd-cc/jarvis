import { v4 as uuidv4 } from 'uuid';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, requestId: string | undefined, message: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const entry = {
    timestamp: formatTimestamp(),
    level,
    requestId: requestId || '-',
    message,
    ...(meta ? { meta } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug(requestId: string | undefined, message: string, meta?: Record<string, unknown>) {
    log('debug', requestId, message, meta);
  },
  info(requestId: string | undefined, message: string, meta?: Record<string, unknown>) {
    log('info', requestId, message, meta);
  },
  warn(requestId: string | undefined, message: string, meta?: Record<string, unknown>) {
    log('warn', requestId, message, meta);
  },
  error(requestId: string | undefined, message: string, meta?: Record<string, unknown>) {
    log('error', requestId, message, meta);
  },
};

/** Generate a new request ID for each incoming request */
export function createRequestId(): string {
  return uuidv4();
}
