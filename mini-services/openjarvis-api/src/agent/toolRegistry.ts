/**
 * Tool Registry — manages available tools, validates input/output,
 * enforces timeouts, retries, and audit logging.
 */
import { ToolHandler, ToolExecutionResult } from './types.js';
import { missionEventService } from '../services/missionEventService.js';
import { logger } from '../utils/logger.js';

export class ToolRegistry {
  private tools = new Map<string, ToolHandler>();
  private auditLog: Array<{
    timestamp: Date;
    toolName: string;
    input: unknown;
    result: ToolExecutionResult;
    missionId?: string;
  }> = [];

  /** Register a tool handler */
  register(handler: ToolHandler): void {
    if (this.tools.has(handler.name)) {
      throw new Error(`Tool '${handler.name}' is already registered`);
    }
    this.tools.set(handler.name, handler);
  }

  /** Unregister a tool handler by name */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /** Get a tool handler by name */
  get(name: string): ToolHandler | undefined {
    return this.tools.get(name);
  }

  /** Get all registered tools */
  getAll(): ToolHandler[] {
    return Array.from(this.tools.values());
  }

  /** Get tool definitions for the model provider */
  getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return this.getAll().map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /**
   * Execute a tool with timeout, retry, and audit logging.
   */
  async executeTool(
    toolName: string,
    input: Record<string, unknown>,
    options: {
      timeoutMs?: number;
      retryCount?: number;
      retryBackoffMs?: number;
      missionId?: string;
      requestId?: string;
    } = {},
  ): Promise<ToolExecutionResult> {
    const {
      timeoutMs = parseInt(process.env.TOOL_EXECUTION_TIMEOUT_MS || '30000', 10),
      retryCount = parseInt(process.env.TOOL_RETRY_COUNT || '2', 10),
      retryBackoffMs = parseInt(process.env.TOOL_RETRY_BACKOFF_MS || '1000', 10),
      missionId,
      requestId = '-',
    } = options;

    const handler = this.tools.get(toolName);
    if (!handler) {
      const result: ToolExecutionResult = {
        success: false,
        output: null,
        error: `Tool '${toolName}' not found in registry`,
        durationMs: 0,
      };
      this.audit(toolName, input, result, missionId);
      return result;
    }

    // Validate input against schema
    const validationError = this.validateJsonSchema(input, handler.inputSchema);
    if (validationError) {
      const result: ToolExecutionResult = {
        success: false,
        output: null,
        error: `Input validation failed: ${validationError}`,
        durationMs: 0,
      };
      this.audit(toolName, input, result, missionId);
      return result;
    }

    // Execute with timeout and retry
    let lastError = '';
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      if (attempt > 0) {
        logger.info(requestId, `Retrying tool '${toolName}' (attempt ${attempt + 1}/${retryCount + 1})`);
        await this.sleep(retryBackoffMs * attempt);
      }

      const start = Date.now();
      try {
        const result = await Promise.race([
          handler.execute(input),
          this.timeoutPromise(timeoutMs, toolName),
        ]);
        result.durationMs = Date.now() - start;

        // Validate output against schema
        if (result.success && handler.outputSchema) {
          const outputErr = this.validateJsonSchema(
            result.output as Record<string, unknown>,
            handler.outputSchema,
          );
          if (outputErr) {
            result.success = false;
            result.error = `Output validation failed: ${outputErr}`;
          }
        }

        this.audit(toolName, input, result, missionId);
        return result;
      } catch (err: any) {
        lastError = String(err.message || err);
        logger.warn(requestId, `Tool '${toolName}' attempt ${attempt + 1} failed: ${lastError}`);
      }
    }

    const result: ToolExecutionResult = {
      success: false,
      output: null,
      error: `All ${retryCount + 1} attempts failed. Last error: ${lastError}`,
      durationMs: 0,
    };
    this.audit(toolName, input, result, missionId);
    return result;
  }

  private audit(
    toolName: string,
    input: unknown,
    result: ToolExecutionResult,
    missionId?: string,
  ) {
    this.auditLog.push({
      timestamp: new Date(),
      toolName,
      input,
      result,
      missionId,
    });
  }

  getAuditLog() {
    return [...this.auditLog];
  }

  private timeoutPromise(ms: number, toolName: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Tool '${toolName}' timed out after ${ms}ms`)), ms),
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Minimal JSON Schema validation — checks required fields and types */
  private validateJsonSchema(
    data: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): string | null {
    if (!schema || !schema.properties) return null;
    const properties = schema.properties as Record<string, any>;
    const required = (schema.required as string[]) || [];

    for (const field of required) {
      if (data[field] === undefined || data[field] === null) {
        return `Missing required field: ${field}`;
      }
    }

    for (const [key, propSchema] of Object.entries(properties)) {
      if (data[key] !== undefined && propSchema.type) {
        const actualType = typeof data[key];
        const expectedTypes = Array.isArray(propSchema.type) ? propSchema.type : [propSchema.type];
        // Map 'number' to accept int
        const typeMap: Record<string, string[]> = {
          string: ['string'],
          number: ['number'],
          integer: ['number'],
          boolean: ['boolean'],
          array: ['object'],
          object: ['object'],
        };
        const allowed = typeMap[propSchema.type] || [propSchema.type];
        if (!allowed.includes(actualType) && !(propSchema.type === 'integer' && typeof data[key] === 'number')) {
          return `Field '${key}' expected type ${propSchema.type}, got ${actualType}`;
        }
      }
    }

    return null;
  }
}
