/**
 * Structured error format for the API.
 * Every error response must follow this shape:
 * { error: { code: string, message: string, requestId: string } }
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly requestId: string;
  public readonly isOperational: boolean;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    requestId: string = '-',
    isOperational: boolean = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.isOperational = isOperational;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        requestId: this.requestId,
      },
    };
  }
}

// Convenience factories
export function badRequest(code: string, message: string, requestId: string): AppError {
  return new AppError(code, message, 400, requestId);
}

export function notFound(code: string, message: string, requestId: string): AppError {
  return new AppError(code, message, 404, requestId);
}

export function conflict(code: string, message: string, requestId: string): AppError {
  return new AppError(code, message, 409, requestId);
}

export function internalError(code: string, message: string, requestId: string): AppError {
  return new AppError(code, message, 500, requestId);
}

export function unauthorized(code: string, message: string, requestId: string): AppError {
  return new AppError(code, message, 401, requestId);
}
