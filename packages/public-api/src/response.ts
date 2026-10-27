import type { ApiEnvironment } from "./contracts";

export interface ApiErrorBody {
  error: { code: string; message: string; request_id: string; details?: unknown };
}

export class PublicApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "PublicApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function success<T>(data: T, status = 200, headers: Record<string, string> = {}) {
  const body = data && typeof data === "object" && "data" in (data as Record<string, unknown>)
    ? data
    : { data };
  return { body, status, headers };
}

export function collection<T>(data: readonly T[], options: { hasMore?: boolean; nextCursor?: string | null } = {}) {
  return {
    data,
    pagination: {
      has_more: options.hasMore ?? false,
      next_cursor: options.nextCursor ?? null,
    },
  };
}

export function errorBody(error: unknown, requestId: string): { body: ApiErrorBody; status: number } {
  if (error instanceof PublicApiError) return { body: { error: { code: error.code, message: error.message, request_id: requestId, ...(error.details === undefined ? {} : { details: error.details }) } }, status: error.status };
  if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505") {
    return { body: { error: { code: "conflict", message: "The request conflicts with an existing resource.", request_id: requestId } }, status: 409 };
  }
  return { body: { error: { code: "internal_error", message: "An unexpected error occurred.", request_id: requestId } }, status: 500 };
}

export function rateLimitHeaders(limit: number, remaining: number, reset: number) {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Reset": String(reset),
  };
}

export function requestHeaders(requestIdValue: string, environment?: ApiEnvironment) {
  return {
    "X-Request-Id": requestIdValue,
    ...(environment ? { "X-OperiX-Environment": environment } : {}),
  };
}
