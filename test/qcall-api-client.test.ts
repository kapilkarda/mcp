import { test } from "node:test";
import assert from "node:assert";
import { mock } from "node:test";
import { QcallApiClient } from "../src/services/qcall-api-client.js";
import { ApiError, AuthenticationError, RateLimitError } from "../src/types/index.js";
import axios from "axios";

test("QcallApiClient - success response returns data", async () => {
  const mockAdapter = mock.fn(async (config: any) => ({
    status: 200,
    data: { success: true, data: { id: "123", name: "Test" } },
    config,
    headers: {},
    statusText: "OK"
  }));

  const client = new QcallApiClient({
    baseURL: "https://api.qcall.ai",
    apiKey: "test-key"
  });

  (client as any).client.defaults.adapter = mockAdapter;

  const result = await client.get("/test");
  assert.strictEqual(mockAdapter.mock.callCount(), 1);
});

test("QcallApiClient - success false in HTTP 200 throws ApiError", async () => {
  const mockAdapter = mock.fn(async (config: any) => ({
    status: 200,
    data: { success: false, status: 400, message: "Invalid request" },
    config,
    headers: {},
    statusText: "OK"
  }));

  const client = new QcallApiClient({
    baseURL: "https://api.qcall.ai",
    apiKey: "test-key"
  });

  (client as any).client.defaults.adapter = mockAdapter;

  try {
    await client.get("/test");
    assert.fail("Should throw ApiError");
  } catch (error) {
    assert(error instanceof ApiError);
    assert.strictEqual((error as ApiError).statusCode, 400);
    assert((error as ApiError).message.includes("Invalid"));
  }
});

test("QcallApiClient - 401 response throws AuthenticationError", async () => {
  const mockAdapter = mock.fn(async (config: any) => {
    const error: any = new Error("Request failed");
    error.isAxiosError = true;
    error.response = {
      status: 401,
      data: { message: "Invalid key" },
      config,
      headers: {},
      statusText: "Unauthorized"
    };
    error.config = config;
    throw error;
  });

  const client = new QcallApiClient({
    baseURL: "https://api.qcall.ai",
    apiKey: "test-key"
  });

  (client as any).client.defaults.adapter = mockAdapter;

  try {
    await client.get("/test");
    assert.fail("Should throw AuthenticationError");
  } catch (error) {
    assert(error instanceof AuthenticationError);
  }
});

test("QcallApiClient - 429 response throws RateLimitError", async () => {
  const mockAdapter = mock.fn(async (config: any) => {
    const error: any = new Error("Too many requests");
    error.isAxiosError = true;
    error.response = {
      status: 429,
      data: {},
      config,
      headers: { "retry-after": "60" },
      statusText: "Too Many Requests"
    };
    error.config = config;
    throw error;
  });

  const client = new QcallApiClient({
    baseURL: "https://api.qcall.ai",
    apiKey: "test-key"
  });

  (client as any).client.defaults.adapter = mockAdapter;

  try {
    await client.get("/test");
    assert.fail("Should throw RateLimitError");
  } catch (error) {
    assert(error instanceof RateLimitError);
    assert.strictEqual((error as RateLimitError).retryAfter, 60);
  }
});

test("QcallApiClient - network error returns 502 ApiError", async () => {
  const mockAdapter = mock.fn(async (config: any) => {
    const error: any = new Error("Network error");
    error.isAxiosError = true;
    error.code = "ECONNREFUSED";
    error.config = config;
    error.response = undefined;
    throw error;
  });

  const client = new QcallApiClient({
    baseURL: "https://api.qcall.ai",
    apiKey: "test-key"
  });

  (client as any).client.defaults.adapter = mockAdapter;

  try {
    await client.get("/test");
    assert.fail("Should throw ApiError");
  } catch (error) {
    assert(error instanceof ApiError);
    assert.strictEqual((error as ApiError).statusCode, 502);
  }
});

test("QcallApiClient - timeout returns 504 ApiError", async () => {
  const mockAdapter = mock.fn(async (config: any) => {
    const error: any = new Error("Timeout");
    error.isAxiosError = true;
    error.code = "ECONNABORTED";
    error.config = config;
    error.response = undefined;
    throw error;
  });

  const client = new QcallApiClient({
    baseURL: "https://api.qcall.ai",
    apiKey: "test-key"
  });

  (client as any).client.defaults.adapter = mockAdapter;

  try {
    await client.get("/test");
    assert.fail("Should throw ApiError");
  } catch (error) {
    assert(error instanceof ApiError);
    assert.strictEqual((error as ApiError).statusCode, 504);
  }
});

test("QcallApiClient - sends x-api-key header", async () => {
  const mockAdapter = mock.fn(async (config: any) => {
    assert.strictEqual(config.headers["x-api-key"], "test-api-key");
    return {
      status: 200,
      data: { success: true },
      config,
      headers: {},
      statusText: "OK"
    };
  });

  const client = new QcallApiClient({
    baseURL: "https://api.qcall.ai",
    apiKey: "test-api-key"
  });

  (client as any).client.defaults.adapter = mockAdapter;

  await client.get("/test");
  assert.strictEqual(mockAdapter.mock.callCount(), 1);
});

test("QcallApiClient - post method sends body", async () => {
  let capturedData: any;
  const mockAdapter = mock.fn(async (config: any) => {
    capturedData = config.data;
    return {
      status: 200,
      data: { success: true },
      config,
      headers: {},
      statusText: "OK"
    };
  });

  const client = new QcallApiClient({
    baseURL: "https://api.qcall.ai",
    apiKey: "test-key"
  });

  (client as any).client.defaults.adapter = mockAdapter;

  const result = await client.post("/test", { name: "Test" });
  assert.strictEqual(mockAdapter.mock.callCount(), 1);
  const parsed = typeof capturedData === "string" ? JSON.parse(capturedData) : capturedData;
  assert.deepStrictEqual(parsed, { name: "Test" });
});

test("QcallApiClient - patch method works", async () => {
  const mockAdapter = mock.fn(async (config: any) => {
    assert.strictEqual(config.method, "patch");
    return {
      status: 200,
      data: { success: true },
      config,
      headers: {},
      statusText: "OK"
    };
  });

  const client = new QcallApiClient({
    baseURL: "https://api.qcall.ai",
    apiKey: "test-key"
  });

  (client as any).client.defaults.adapter = mockAdapter;

  await client.patch("/test", { field: "value" });
  assert.strictEqual(mockAdapter.mock.callCount(), 1);
});

test("QcallApiClient - delete method works", async () => {
  const mockAdapter = mock.fn(async (config: any) => {
    assert.strictEqual(config.method, "delete");
    return {
      status: 200,
      data: { success: true },
      config,
      headers: {},
      statusText: "OK"
    };
  });

  const client = new QcallApiClient({
    baseURL: "https://api.qcall.ai",
    apiKey: "test-key"
  });

  (client as any).client.defaults.adapter = mockAdapter;

  await client.delete("/test");
  assert.strictEqual(mockAdapter.mock.callCount(), 1);
});

test("QcallApiClient - supports query parameters", async () => {
  const mockAdapter = mock.fn(async (config: any) => {
    assert(config.params !== undefined);
    return {
      status: 200,
      data: { success: true },
      config,
      headers: {},
      statusText: "OK"
    };
  });

  const client = new QcallApiClient({
    baseURL: "https://api.qcall.ai",
    apiKey: "test-key"
  });

  (client as any).client.defaults.adapter = mockAdapter;

  await client.get("/test", { page: 1, limit: 10 });
  assert.strictEqual(mockAdapter.mock.callCount(), 1);
});
