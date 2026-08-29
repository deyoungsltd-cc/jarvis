export const logger = {
  info: (_ctx: string, msg: string) => console.log(`[${new Date().toISOString()}] [INFO] ${msg}`),
  warn: (_ctx: string, msg: string) => console.warn(`[${new Date().toISOString()}] [WARN] ${msg}`),
  error: (_ctx: string, msg: string) => console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`),
};
