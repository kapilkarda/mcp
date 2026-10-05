/**
 * HTTP client for the QCall REST API (`/api/v1`).
 *
 * - Authenticates with the caller's API key in the `x-api-key` header (what the
 *   backend's verifyTokenAuth expects for keys).
 * - Normalizes QCall's error convention: many endpoints answer HTTP 200 with
 *   `{ success: false, status, message }`, which we turn into thrown ApiErrors so
 *   tools never mistake a failure for data.
 * - Logs only method, path and status — never headers, keys or bodies.
 */

import axios, { AxiosError, type AxiosInstance } from "axios";
import { API_TIMEOUT } from "../constants.js";
import {
  ApiError,
  AuthenticationError,
  RateLimitError,
  type ApiClientConfig,
  type QcallEnvelope
} from "../types/index.js";
import { getRequestApiClient } from "./request-context.js";

type Query = Record<string, string | number | boolean | undefined>;

function messageOf(data: unknown, fallback: string): string {
  const body = data as { message?: unknown; error?: unknown } | undefined;
  if (typeof body?.message === "string" && body.message) return body.message;
  if (typeof body?.error === "string" && body.error) return body.error;
  return fallback;
}

export class QcallApiClient {
  private readonly client: AxiosInstance;

  constructor(config: ApiClientConfig) {
    this.client = axios.create({
      baseURL: config.baseURL.replace(/\/$/, ""),
      timeout: config.timeout ?? API_TIMEOUT,
      maxRedirects: 0, // never replay the x-api-key header to another host
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": config.apiKey
      }
    });

    this.client.interceptors.response.use(
      (response) => {
        const body = response.data as QcallEnvelope | undefined;
        if (body && typeof body === "object" && body.success === false) {
          const status = typeof body.status === "number" && body.status >= 400 ? body.status : 400;
          logFailure(response.config.method, response.config.url, status, body.message);
          throw new ApiError(status, messageOf(body, "Request failed"), body);
        }
        return response;
      },
      (error: unknown) => {
        throw toApiError(error);
      }
    );
  }

  async get<T = QcallEnvelope>(path: string, params?: Query): Promise<T> {
    return (await this.client.get<T>(path, { params })).data;
  }

  async post<T = QcallEnvelope>(path: string, body?: unknown, params?: Query): Promise<T> {
    return (await this.client.post<T>(path, body ?? {}, { params })).data;
  }

  async put<T = QcallEnvelope>(path: string, body?: unknown, params?: Query): Promise<T> {
    return (await this.client.put<T>(path, body ?? {}, { params })).data;
  }

  async patch<T = QcallEnvelope>(path: string, body?: unknown, params?: Query): Promise<T> {
    return (await this.client.patch<T>(path, body ?? {}, { params })).data;
  }

  async delete<T = QcallEnvelope>(path: string, params?: Query): Promise<T> {
    return (await this.client.delete<T>(path, { params })).data;
  }
}

function logFailure(method: string | undefined, url: string | undefined, status: number | string, message?: unknown) {
  const path = (url || "?").split("?")[0].slice(0, 120);
  const text = typeof message === "string" ? message.slice(0, 160) : "";
  console.error(`[api] ${(method || "?").toUpperCase()} ${path} -> ${status} ${text}`);
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (!axios.isAxiosError(error)) return new ApiError(500, "Unexpected error calling QCall.");

  const axiosError = error as AxiosError;
  const response = axiosError.response;
  if (!response) {
    logFailure(axiosError.config?.method, axiosError.config?.url, axiosError.code || "network");
    return axiosError.code === "ECONNABORTED"
      ? new ApiError(504, "QCall API timed out. Please try again.")
      : new ApiError(502, "QCall API is unreachable. Please try again.");
  }

  logFailure(axiosError.config?.method, axiosError.config?.url, response.status, (response.data as QcallEnvelope)?.message);
  switch (response.status) {
    case 401:
      return new AuthenticationError(messageOf(response.data, "Invalid or revoked QCall API key."));
    case 429: {
      const retryAfter = Number(response.headers["retry-after"]);
      return new RateLimitError(Number.isFinite(retryAfter) ? retryAfter : undefined);
    }
    default:
      return new ApiError(response.status, messageOf(response.data, `QCall API error (${response.status})`), response.data);
  }
}

// stdio mode: one process-wide client built from env vars.
let processClient: QcallApiClient | undefined;

export function initProcessApiClient(config: ApiClientConfig): QcallApiClient {
  processClient = new QcallApiClient(config);
  return processClient;
}

/** The client for the current request (hosted) or the process (stdio). */
export function getApiClient(): QcallApiClient {
  const client = getRequestApiClient() ?? processClient;
  if (!client) throw new Error("QCall API client not initialized.");
  return client;
}
