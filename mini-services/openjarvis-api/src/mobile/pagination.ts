/**
 * Pagination Utility — Phase 7
 *
 * Provides a reusable paginate function for any Prisma findMany query.
 */
import type { PaginatedRequest, PaginatedResponse } from './types.js';

export interface PaginationOptions extends PaginatedRequest {
  defaultLimit?: number;
  maxLimit?: number;
}

export function parsePagination(options: PaginationOptions): {
  skip: number;
  take: number;
  page: number;
  limit: number;
} {
  const defaultLimit = options.defaultLimit || 20;
  const maxLimit = options.maxLimit || 100;
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(maxLimit, Math.max(1, options.limit || defaultLimit));
  const skip = (page - 1) * limit;

  return { skip, take: limit, page, limit };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}
