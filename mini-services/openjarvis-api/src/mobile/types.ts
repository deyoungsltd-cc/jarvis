/**
 * Mobile API Types — Phase 7
 *
 * Mobile-specific request/response shapes with pagination,
 * lightweight payloads, and client registration.
 */

export interface PaginatedRequest {
  page?: number;     // 1-based, default 1
  limit?: number;    // per page, default 20, max 100
  sort?: string;     // field name
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface MobileClient {
  id: string;
  name: string;
  platform: 'ios' | 'android' | 'web';
  apiKey: string;
  enabled: boolean;
  lastSeenAt?: Date;
  createdAt: Date;
}

export interface RegisterClientInput {
  name: string;
  platform: 'ios' | 'android' | 'web';
}

export interface MobileMissionSummary {
  id: string;
  goal: string;
  status: string;
  toolCallCount: number;
  tokenUsage: number;
  createdAt: string;
  completedAt?: string;
}

export interface MobileAgentRunResponse {
  missionId: string;
  status: string;
  result?: string;
  stages: Array<{ stage: string; timestamp: string }>;
}

export const MOBILE_API_VERSION = 'v1';
