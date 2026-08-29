export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(code: string, message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
  }
}

export function badRequest(code: string, message: string): AppError {
  return new AppError(code, message, 400);
}

export function notFound(code: string, message: string): AppError {
  return new AppError(code, message, 404);
}

export function unauthorized(code: string, message: string): AppError {
  return new AppError(code, message, 401);
}

export function conflict(code: string, message: string): AppError {
  return new AppError(code, message, 409);
}

export function internalError(code: string, message: string): AppError {
  return new AppError(code, message, 500);
}

/** Global Next.js error handler — use in catch blocks */
export function handleError(err: unknown): Response {
  if (err instanceof AppError) {
    return Response.json({ error: { code: err.code, message: err.message, requestId: '-' } }, { status: err.statusCode });
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  return Response.json({ error: { code: 'INTERNAL_ERROR', message, requestId: '-' } }, { status: 500 });
}
