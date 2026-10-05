/**
 * Bearer-token gate for the hosted MCP endpoint.
 *
 * The MCP server is a thin proxy: it never issues API keys itself, it only checks
 * that the caller's key (a QCall API key, or the key sealed inside an OAuth access
 * token) is accepted by the QCall API, and answers 401 with an RFC 9728
 * `WWW-Authenticate` challenge otherwise so MCP clients can start OAuth.
 */

import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import axios from "axios";

const VALID_TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_CACHED_TOKENS = 10_000;
const TOKEN_CHECK_TIMEOUT_MS = 10_000;
// Sealed OAuth access tokens (see oauth/qcall-oauth-provider.ts); anything else is an API key.
export const OAUTH_ACCESS_TOKEN_PREFIX = "qcall_at_";
export const OAUTH_REFRESH_TOKEN_PREFIX = "qcall_rt_";

// sha256(key) -> expiry timestamp. Raw keys are never kept in maps or logs.
const validTokenCache = new Map<string, number>();

export interface BearerAuthOptions {
  apiBaseUrl: string;
  resourceMetadataUrl: string;
  /** Maps an OAuth access token to the QCall API key it carries (undefined = invalid/expired). */
  resolveOAuthToken?: (token: string) => string | undefined;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

/** Bearer → QCall API key: OAuth tokens are unsealed, raw API keys pass through. */
export function resolveApiKey(
  bearer: string | undefined,
  resolveOAuthToken?: (token: string) => string | undefined
): string | undefined {
  if (!bearer) return undefined;
  if (bearer.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)) return resolveOAuthToken?.(bearer);
  // Refresh tokens are only valid at /token, never as a Bearer credential.
  if (bearer.startsWith(OAUTH_REFRESH_TOKEN_PREFIX)) return undefined;
  return bearer;
}

/** True when the key was verified recently — no API round-trip needed. */
export function isRecentlyVerifiedToken(token: string | undefined): boolean {
  if (!token) return false;
  const expiresAt = validTokenCache.get(hashToken(token));
  return !!expiresAt && expiresAt > Date.now();
}

/** Returns true (valid), false (rejected by API) — throws when the API is unreachable. */
async function isApiKeyAccepted(apiKey: string, apiBaseUrl: string): Promise<boolean> {
  if (isRecentlyVerifiedToken(apiKey)) return true;
  const cacheKey = hashToken(apiKey);

  // Cheapest authenticated endpoint: wallet balance (one indexed lookup + one row).
  const response = await axios.get(`${apiBaseUrl}/user/amount`, {
    headers: { "x-api-key": apiKey, Accept: "application/json" },
    timeout: TOKEN_CHECK_TIMEOUT_MS,
    maxRedirects: 0,
    validateStatus: () => true
  });

  if (response.status === 401) {
    validTokenCache.delete(cacheKey);
    return false;
  }
  // 2xx or 403 (authenticated but not allowed) prove the key is genuine. Anything
  // else (429, 404, 5xx…) is inconclusive → caller answers 503.
  const accepted = (response.status >= 200 && response.status < 300) || response.status === 403;
  if (!accepted) throw new Error(`Key check inconclusive: upstream status ${response.status}`);

  if (validTokenCache.size >= MAX_CACHED_TOKENS) validTokenCache.clear();
  validTokenCache.set(cacheKey, Date.now() + VALID_TOKEN_TTL_MS);
  return true;
}

function sendUnauthorized(res: Response, resourceMetadataUrl: string, description: string): void {
  res
    .status(401)
    .set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token", error_description="${description}"`
    )
    .json({ jsonrpc: "2.0", error: { code: -32001, message: `Unauthorized: ${description}` }, id: null });
}

export function requireBearerAuth(options: BearerAuthOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const bearer = extractBearerToken(req);
    const apiKey = resolveApiKey(bearer, options.resolveOAuthToken);
    if (bearer && !apiKey) {
      sendUnauthorized(res, options.resourceMetadataUrl, "Access token is invalid or expired.");
      return;
    }
    if (!apiKey) {
      sendUnauthorized(
        res,
        options.resourceMetadataUrl,
        "Missing bearer token. Use a QCall API key (qc_live_...) or sign in with OAuth."
      );
      return;
    }

    try {
      if (!(await isApiKeyAccepted(apiKey, options.apiBaseUrl))) {
        sendUnauthorized(res, options.resourceMetadataUrl, "Invalid or revoked QCall API key.");
        return;
      }
    } catch (error) {
      console.error("[auth] key check unavailable:", (error as Error).message);
      res.status(503).set("Retry-After", "5").json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "QCall API is temporarily unavailable. Please retry." },
        id: null
      });
      return;
    }

    res.locals.apiKey = apiKey;
    next();
  };
}
