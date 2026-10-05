import { test } from "node:test";
import assert from "node:assert";
import { QcallOAuthProvider } from "../src/oauth/qcall-oauth-provider.js";
import { OAuthTokenSealer, fingerprint } from "../src/oauth/oauth-token-sealer.js";
import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

test("QcallOAuthProvider - issueCode binds code to client", () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const provider = new QcallOAuthProvider(sealer);

  const pending = {
    cid: "client-id-12345",
    ru: "https://claude.ai/callback",
    cc: "code-challenge-value",
    st: "state-value"
  };

  const code = provider.issueCode(pending, "api-key-xyz");
  assert(typeof code === "string");
  assert(code.length > 40);
});

test("QcallOAuthProvider - exchangeAuthorizationCode returns access token with qcall_at_ prefix", async () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const provider = new QcallOAuthProvider(sealer);

  const clientMetadata = {
    client_id: "test-client",
    client_name: "Test Client",
    redirect_uris: ["https://claude.ai/callback"],
    response_types: ["code"],
    grant_types: ["authorization_code"],
    token_endpoint_auth_method: "none" as const,
    client_id_issued_at: Math.floor(Date.now() / 1000)
  };

  const pending = {
    cid: clientMetadata.client_id,
    ru: "https://claude.ai/callback",
    cc: "code-challenge",
    st: "state"
  };

  const code = provider.issueCode(pending, "test-api-key");
  const tokens = await provider.exchangeAuthorizationCode(clientMetadata, code);

  assert(tokens.access_token.startsWith("qcall_at_"));
  assert.strictEqual(tokens.token_type, "Bearer");
  assert(tokens.expires_in > 0);
  assert(tokens.refresh_token !== undefined);
});

test("QcallOAuthProvider - exchangeAuthorizationCode fails when code bound to different client", async () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const provider = new QcallOAuthProvider(sealer);

  const client1 = {
    client_id: "client-1",
    client_name: "Client 1",
    redirect_uris: ["https://claude.ai/callback"],
    response_types: ["code"],
    grant_types: ["authorization_code"],
    token_endpoint_auth_method: "none" as const,
    client_id_issued_at: Math.floor(Date.now() / 1000)
  };

  const client2 = {
    client_id: "client-2",
    client_name: "Client 2",
    redirect_uris: ["https://claude.ai/callback"],
    response_types: ["code"],
    grant_types: ["authorization_code"],
    token_endpoint_auth_method: "none" as const,
    client_id_issued_at: Math.floor(Date.now() / 1000)
  };

  const pending = {
    cid: client1.client_id,
    ru: "https://claude.ai/callback",
    cc: "code-challenge",
    st: "state"
  };

  const code = provider.issueCode(pending, "test-key");

  try {
    await provider.exchangeAuthorizationCode(client2, code);
    assert.fail("Should throw InvalidGrantError");
  } catch (error) {
    assert(error instanceof InvalidGrantError);
  }
});

test("QcallOAuthProvider - exchangeAuthorizationCode fails on redirect_uri mismatch", async () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const provider = new QcallOAuthProvider(sealer);

  const client = {
    client_id: "test-client",
    client_name: "Test",
    redirect_uris: ["https://claude.ai/callback"],
    response_types: ["code"],
    grant_types: ["authorization_code"],
    token_endpoint_auth_method: "none" as const,
    client_id_issued_at: Math.floor(Date.now() / 1000)
  };

  const pending = {
    cid: client.client_id,
    ru: "https://claude.ai/callback",
    cc: "code-challenge",
    st: "state"
  };

  const code = provider.issueCode(pending, "test-key");

  try {
    await provider.exchangeAuthorizationCode(client, code, undefined, "https://different.com/callback");
    assert.fail("Should throw InvalidGrantError");
  } catch (error) {
    assert(error instanceof InvalidGrantError);
  }
});

test("QcallOAuthProvider - exchangeRefreshToken issues new tokens", async () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const provider = new QcallOAuthProvider(sealer);

  const client = {
    client_id: "test-client",
    client_name: "Test",
    redirect_uris: ["https://claude.ai/callback"],
    response_types: ["code"],
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "none" as const,
    client_id_issued_at: Math.floor(Date.now() / 1000)
  };

  const pending = {
    cid: client.client_id,
    ru: "https://claude.ai/callback",
    cc: "code-challenge",
    st: "state"
  };

  const code = provider.issueCode(pending, "test-api-key");
  const tokens = await provider.exchangeAuthorizationCode(client, code);

  assert(tokens.refresh_token !== undefined);

  const newTokens = await provider.exchangeRefreshToken(client, tokens.refresh_token);
  assert(newTokens.access_token.startsWith("qcall_at_"));
  assert(newTokens.refresh_token !== undefined);
  assert.notStrictEqual(newTokens.refresh_token, tokens.refresh_token);
});

test("QcallOAuthProvider - resolveApiKey extracts key from access token", async () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const provider = new QcallOAuthProvider(sealer);

  const client = {
    client_id: "test-client",
    client_name: "Test",
    redirect_uris: ["https://claude.ai/callback"],
    response_types: ["code"],
    grant_types: ["authorization_code"],
    token_endpoint_auth_method: "none" as const,
    client_id_issued_at: Math.floor(Date.now() / 1000)
  };

  const pending = {
    cid: client.client_id,
    ru: "https://claude.ai/callback",
    cc: "code-challenge",
    st: "state"
  };

  const code = provider.issueCode(pending, "secret-api-key");
  const tokens = await provider.exchangeAuthorizationCode(client, code);

  const resolved = provider.resolveApiKey(tokens.access_token);
  assert.strictEqual(resolved, "secret-api-key");
});

test("QcallOAuthProvider - resolveApiKey returns undefined for invalid token", () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const provider = new QcallOAuthProvider(sealer);

  const resolved = provider.resolveApiKey("qcall_at_invalid-token");
  assert.strictEqual(resolved, undefined);
});
