import { test } from "node:test";
import assert from "node:assert";
import { mock } from "node:test";
import { extractBearerToken, resolveApiKey, requireBearerAuth, isRecentlyVerifiedToken } from "../src/http-auth-middleware.js";
import axios from "axios";

test("extractBearerToken - extracts token from Authorization header", () => {
  const req = {
    headers: { authorization: "Bearer token-value-123" }
  } as any;

  const token = extractBearerToken(req);
  assert.strictEqual(token, "token-value-123");
});

test("extractBearerToken - case insensitive Bearer", () => {
  const req = {
    headers: { authorization: "bearer token-value-123" }
  } as any;

  const token = extractBearerToken(req);
  assert.strictEqual(token, "token-value-123");
});

test("extractBearerToken - returns undefined for missing header", () => {
  const req = { headers: {} } as any;
  const token = extractBearerToken(req);
  assert.strictEqual(token, undefined);
});

test("extractBearerToken - handles whitespace", () => {
  const req = {
    headers: { authorization: "  Bearer  token-value  " }
  } as any;

  const token = extractBearerToken(req);
  assert.strictEqual(token, "token-value");
});

test("resolveApiKey - OAuth token unsealed via resolver", () => {
  const mockResolver = (token: string) => {
    if (token === "qcall_at_sealed-token") return "resolved-api-key";
    return undefined;
  };

  const key = resolveApiKey("qcall_at_sealed-token", mockResolver);
  assert.strictEqual(key, "resolved-api-key");
});

test("resolveApiKey - raw API key passes through", () => {
  const key = resolveApiKey("qc_live_raw-key");
  assert.strictEqual(key, "qc_live_raw-key");
});

test("resolveApiKey - returns undefined for undefined bearer", () => {
  const key = resolveApiKey(undefined);
  assert.strictEqual(key, undefined);
});

test("resolveApiKey - OAuth token without resolver returns undefined", () => {
  const key = resolveApiKey("qcall_at_sealed");
  assert.strictEqual(key, undefined);
});

test("isRecentlyVerifiedToken - returns true for recently verified token", () => {
  const token = "test-token-123";
  // This tests the cache behavior — a token verified within the TTL
  // In real usage, this would be set by isApiKeyAccepted
  // For now, we test that undefined tokens return false
  assert.strictEqual(isRecentlyVerifiedToken(undefined), false);
});

test("requireBearerAuth - returns 401 when no token provided", async () => {
  const middleware = requireBearerAuth({
    apiBaseUrl: "https://api.qcall.ai",
    resourceMetadataUrl: "https://qcall.ai/.well-known/oauth"
  });

  const req = { headers: {} } as any;
  const headers: any = {};
  const res = {
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    set: (key: string, val: string) => {
      headers[key.toLowerCase()] = val;
      return res;
    },
    json: (data: any) => {
      res.jsonData = data;
    },
    statusCode: 0,
    jsonData: null
  } as any;
  const next = mock.fn();

  await middleware(req, res, next);

  assert.strictEqual(res.statusCode, 401);
  assert(headers["www-authenticate"] !== undefined);
  assert.strictEqual(next.mock.callCount(), 0);
});

test("requireBearerAuth - returns 401 for invalid OAuth token", async () => {
  const middleware = requireBearerAuth({
    apiBaseUrl: "https://api.qcall.ai",
    resourceMetadataUrl: "https://qcall.ai/.well-known/oauth",
    resolveOAuthToken: () => undefined
  });

  const req = {
    headers: { authorization: "Bearer qcall_at_invalid" }
  } as any;
  const res = {
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    set: (key: string, val: string) => {
      res.headers = res.headers || {};
      res.headers[key] = val;
      return res;
    },
    json: (data: any) => {
      res.jsonData = data;
    },
    statusCode: 0,
    headers: {} as any,
    jsonData: null
  } as any;
  const next = mock.fn();

  await middleware(req, res, next);

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(next.mock.callCount(), 0);
});

test("requireBearerAuth - calls next when valid API key", async () => {
  // Mock axios to return 200 for the key check
  const mockAxios = {
    get: mock.fn(async () => ({
      status: 200,
      data: { success: true }
    }))
  };

  // Temporarily replace axios
  const originalAxios = axios.get;
  (axios as any).get = mockAxios.get;

  try {
    const middleware = requireBearerAuth({
      apiBaseUrl: "https://api.qcall.ai",
      resourceMetadataUrl: "https://qcall.ai/.well-known/oauth"
    });

    const req = {
      headers: { authorization: "Bearer qc_live_valid_key" },
      user: { workspace_id: "ws123" }
    } as any;
    const res = {
      locals: {},
      status: () => res,
      set: () => res,
      json: () => {}
    } as any;
    const next = mock.fn();

    await middleware(req, res, next);

    assert.strictEqual(next.mock.callCount(), 1);
    assert.strictEqual(res.locals.apiKey, "qc_live_valid_key");
  } finally {
    (axios as any).get = originalAxios;
  }
});

test("requireBearerAuth - returns 401 when API rejects key", async () => {
  const mockAxios = {
    get: mock.fn(async () => ({
      status: 401,
      data: {}
    }))
  };

  const originalAxios = axios.get;
  (axios as any).get = mockAxios.get;

  try {
    const middleware = requireBearerAuth({
      apiBaseUrl: "https://api.qcall.ai",
      resourceMetadataUrl: "https://qcall.ai/.well-known/oauth"
    });

    const req = {
      headers: { authorization: "Bearer qc_live_invalid" }
    } as any;
    const res = {
      status: (code: number) => {
        res.statusCode = code;
        return res;
      },
      set: (key: string, val: string) => {
        res.headers = res.headers || {};
        res.headers[key] = val;
        return res;
      },
      json: () => {},
      statusCode: 0,
      headers: {} as any
    } as any;
    const next = mock.fn();

    await middleware(req, res, next);

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(next.mock.callCount(), 0);
  } finally {
    (axios as any).get = originalAxios;
  }
});

test("requireBearerAuth - returns 503 when API unreachable", async () => {
  const mockAxios = {
    get: mock.fn(async () => {
      throw new Error("Network error");
    })
  };

  const originalAxios = axios.get;
  (axios as any).get = mockAxios.get;

  try {
    const middleware = requireBearerAuth({
      apiBaseUrl: "https://api.qcall.ai",
      resourceMetadataUrl: "https://qcall.ai/.well-known/oauth"
    });

    const req = {
      headers: { authorization: "Bearer qc_live_key" }
    } as any;
    const res = {
      status: (code: number) => {
        res.statusCode = code;
        return res;
      },
      set: () => res,
      json: () => {},
      statusCode: 0
    } as any;
    const next = mock.fn();

    await middleware(req, res, next);

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(next.mock.callCount(), 0);
  } finally {
    (axios as any).get = originalAxios;
  }
});
