/**
 * Shared types and error classes for the QCall MCP server.
 */

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

export interface ApiClientConfig {
  baseURL: string;
  /** QCall API key (qc_live_… or legacy UUID), sent as `x-api-key`. */
  apiKey: string;
  timeout?: number;
}

/** Standard QCall envelope: business errors arrive as HTTP 200 with success:false. */
export interface QcallEnvelope<T = unknown> {
  status?: number;
  success?: boolean;
  message?: string;
  data?: T;
  totalItems?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string) {
    super(401, message);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends ApiError {
  constructor(public readonly retryAfter?: number) {
    super(429, "Rate limit exceeded. Please wait before making more requests.");
    this.name = "RateLimitError";
  }
}
