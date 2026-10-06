import { test } from "node:test";
import assert from "node:assert";
import { mock } from "node:test";
import axios from "axios";
import { QcallAccountApi } from "../src/oauth/qcall-account-api.js";

test("QcallAccountApi - login success returns token and email", async () => {
  const mockRequest = mock.fn(async () => ({
    status: 200,
    data: {
      success: true,
      data: {
        token: "jwt-token-123",
        email: "user@example.com",
        steps: 5,
        workspace_id: "ws-123"
      }
    }
  }));

  const api = new QcallAccountApi("https://api.qcall.ai");
  (api as any).request = mockRequest;

  const result = await api.loginWithPassword("user@example.com", "password", "captcha-token");

  assert.strictEqual(result.kind, "token");
  assert.strictEqual((result as any).jwt, "jwt-token-123");
  assert.strictEqual((result as any).email, "user@example.com");
});

test("QcallAccountApi - login steps=0 returns error", async () => {
  const mockRequest = mock.fn(async () => ({
    status: 200,
    data: {
      success: true,
      data: {
        token: "jwt-token-123",
        steps: 0,
        workspace_id: null
      }
    }
  }));

  const api = new QcallAccountApi("https://api.qcall.ai");
  (api as any).request = mockRequest;

  const result = await api.loginWithPassword("user@example.com", "password", "captcha-token");

  assert.strictEqual(result.kind, "error");
  assert((result as any).message.includes("Finish setting up"));
});

test("QcallAccountApi - login success:false returns error message", async () => {
  const mockRequest = mock.fn(async () => ({
    status: 200,
    data: {
      success: false,
      message: "Invalid credentials"
    }
  }));

  const api = new QcallAccountApi("https://api.qcall.ai");
  (api as any).request = mockRequest;

  const result = await api.loginWithPassword("user@example.com", "password", "captcha-token");

  assert.strictEqual(result.kind, "error");
  // Credential failures share one generic message (no account enumeration).
  assert((result as any).message.includes("Incorrect email or password"));
});

test("QcallAccountApi - login 429 returns rate limit error", async () => {
  const mockRequest = mock.fn(async () => ({
    status: 429,
    data: {}
  }));

  const api = new QcallAccountApi("https://api.qcall.ai");
  (api as any).request = mockRequest;

  const result = await api.loginWithPassword("user@example.com", "password", "captcha-token");

  assert.strictEqual(result.kind, "error");
  assert((result as any).message.includes("Too many attempts"));
});

test("QcallAccountApi - loginWithGoogle success", async () => {
  const mockRequest = mock.fn(async () => ({
    status: 200,
    data: {
      success: true,
      data: {
        token: "jwt-from-google",
        email: "user@gmail.com",
        steps: 5,
        workspace_id: "ws-456"
      }
    }
  }));

  const api = new QcallAccountApi("https://api.qcall.ai");
  (api as any).request = mockRequest;

  const result = await api.loginWithGoogle("credential-token", "client-id");

  assert.strictEqual(result.kind, "token");
  assert.strictEqual((result as any).jwt, "jwt-from-google");
});

test("QcallAccountApi - createConnectorApiKey success returns key", async () => {
  const mockRequest = mock.fn(async (method: string, path: string) => {
    if (path.includes("/api-key/list")) {
      return {
        status: 200,
        data: {
          success: true,
          data: [
            { id: "key-1", name: "Claude via Claude.ai (MCP connector · user@example.com)" },
            { id: "key-2", name: "Other key" }
          ]
        }
      };
    }
    return {
      status: 200,
      data: {
        success: true,
        data: {
          api_key: "qc_live_new_key_123",
          id: "key-new"
        }
      }
    };
  });

  const api = new QcallAccountApi("https://api.qcall.ai");
  (api as any).request = mockRequest;

  const result = await api.createConnectorApiKey("jwt-token", {
    clientName: "Claude",
    destination: "Claude.ai",
    email: "user@example.com"
  });

  assert("apiKey" in result);
  assert.strictEqual((result as any).apiKey, "qc_live_new_key_123");
});

test("QcallAccountApi - createConnectorApiKey 403 returns role error", async () => {
  const mockRequest = mock.fn(async () => ({
    status: 403,
    data: { success: false }
  }));

  const api = new QcallAccountApi("https://api.qcall.ai");
  (api as any).request = mockRequest;

  const result = await api.createConnectorApiKey("jwt-token", {
    clientName: "Claude",
    destination: "Claude.ai"
  });

  assert("error" in result);
  assert((result as any).error.includes("role"));
});

test("QcallAccountApi - createConnectorApiKey deletes older same-name keys", async () => {
  const createResponse = {
    status: 200,
    data: {
      success: true,
      data: {
        api_key: "qc_live_new_key",
        id: "key-new"
      }
    }
  };

  const listResponse = {
    status: 200,
    data: {
      success: true,
      data: [
        { id: "key-1", name: "Claude via Claude.ai (MCP connector · user@example.com)" },
        { id: "key-2", name: "Claude via Claude.ai (MCP connector · user@example.com)" },
        { id: "key-3", name: "Other key" }
      ]
    }
  };

  const deleteResponse = {
    status: 200,
    data: { success: true }
  };

  const callLog: string[] = [];
  const mockRequest = mock.fn(async (method: string, path: string) => {
    callLog.push(`${method} ${path}`);
    if (method === "post" && path.includes("/api-key/create")) return createResponse;
    if (method === "get" && path.includes("/api-key/list")) return listResponse;
    if (method === "delete") return deleteResponse;
    throw new Error("Unexpected request");
  });

  const api = new QcallAccountApi("https://api.qcall.ai");
  (api as any).request = mockRequest;

  const result = await api.createConnectorApiKey("jwt-token", {
    clientName: "Claude",
    destination: "Claude.ai",
    email: "user@example.com"
  });

  assert("apiKey" in result);
  // Should have called create, list, and delete for key-1 and key-2
  assert(mockRequest.mock.callCount() >= 3);
});

test("QcallAccountApi - createConnectorApiKey without email skips cleanup", async () => {
  const mockRequest = mock.fn(async () => ({
    status: 200,
    data: {
      success: true,
      data: {
        api_key: "qc_live_new_key",
        id: "key-new"
      }
    }
  }));

  const api = new QcallAccountApi("https://api.qcall.ai");
  (api as any).request = mockRequest;

  const result = await api.createConnectorApiKey("jwt-token", {
    clientName: "Claude",
    destination: "Claude.ai"
    // no email
  });

  assert("apiKey" in result);
  // Should only have called create, not list/delete
  assert.strictEqual(mockRequest.mock.callCount(), 1);
});

test("QcallAccountApi - handles network error gracefully", async () => {
  const mockRequest = mock.fn(async () => {
    throw new Error("Network error");
  });

  const api = new QcallAccountApi("https://api.qcall.ai");
  (api as any).request = mockRequest;

  const result = await api.loginWithPassword("user@example.com", "password", "captcha");

  assert.strictEqual(result.kind, "error");
  assert((result as any).message.includes("temporarily unavailable"));
});

test("QcallAccountApi - sends X-Forwarded-For header when clientIp provided", async () => {
  const mockRequest = mock.fn(async (method: string, path: string, options: any) => {
    assert.strictEqual(options.headers["X-Forwarded-For"], "192.168.1.1");
    return {
      status: 200,
      data: {
        success: true,
        data: {
          token: "jwt",
          steps: 5,
          workspace_id: "ws"
        }
      }
    };
  });

  const api = new QcallAccountApi("https://api.qcall.ai");
  (api as any).request = mockRequest;

  const result = await api.loginWithPassword("user@example.com", "password", "captcha", "192.168.1.1");

  assert.strictEqual(result.kind, "token");
  assert.strictEqual(mockRequest.mock.callCount(), 1);
});

test("QcallAccountApi - creates key with email in name", async () => {
  const mockRequest = mock.fn(async (method: string, path: string, options: any) => {
    if (method === "post" && path.includes("/api-key/create")) {
      const body = options.body;
      assert(body.name.includes("user@example.com"));
      return {
        status: 200,
        data: {
          success: true,
          data: { api_key: "qc_live_key", id: "key-id" }
        }
      };
    }
    return { status: 200, data: { success: true, data: [] } };
  });

  const api = new QcallAccountApi("https://api.qcall.ai");
  (api as any).request = mockRequest;

  const result = await api.createConnectorApiKey("jwt-token", {
    clientName: "Claude",
    destination: "Claude.ai",
    email: "user@example.com"
  });

  assert("apiKey" in result);
  assert.strictEqual(mockRequest.mock.callCount() >= 1, true);
});

test("QcallAccountApi - Google login without data.workspace_id uses the JWT's workspace", async () => {
  const { QcallAccountApi } = await import("../src/oauth/qcall-account-api.js");
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = `${b64({ alg: "HS256" })}.${b64({ id: "u1", workspace_id: "ws-1" })}.sig`;
  const result = (QcallAccountApi as any).toLoginResult(200, { success: true, data: { token: jwt, email: "a@b.c", steps: 1 } });
  assert.strictEqual(result.kind, "token");
  const noWs = `${b64({ alg: "HS256" })}.${b64({ id: "u1" })}.sig`;
  const rejected = (QcallAccountApi as any).toLoginResult(200, { success: true, data: { token: noWs, steps: 1 } });
  assert.strictEqual(rejected.kind, "error");
});
