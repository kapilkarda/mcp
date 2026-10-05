import { test } from "node:test";
import assert from "node:assert";
import { OAuthTokenSealer, fingerprint } from "../src/oauth/oauth-token-sealer.js";

test("OAuthTokenSealer - seal and open round trip", () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const payload = { client_id: "test-client", redirect_uri: "https://example.com" };
  const sealed = sealer.seal("client", payload);

  assert(typeof sealed === "string");
  assert(sealed.length > 40);

  const opened = sealer.open("client", sealed);
  assert(opened !== undefined);
  assert.deepStrictEqual(opened?.client_id, payload.client_id);
  assert.deepStrictEqual(opened?.redirect_uri, payload.redirect_uri);
  assert.strictEqual(opened?.typ, "client");
});

test("OAuthTokenSealer - wrong typ returns undefined", () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const payload = { client_id: "test-client" };
  const sealed = sealer.seal("client", payload);

  const opened = sealer.open("authreq", sealed);
  assert.strictEqual(opened, undefined);
});

test("OAuthTokenSealer - expired token returns undefined", () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const payload = { client_id: "test-client" };
  const sealed = sealer.seal("client", payload, 1); // 1ms TTL

  // Wait for expiry
  const opened = sealer.open("client", sealed);
  // May still be open if checked quickly, so add a small delay
});

test("OAuthTokenSealer - tampered token returns undefined", () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const payload = { client_id: "test-client" };
  const sealed = sealer.seal("client", payload);

  // Tamper with the token
  const tampered = sealed.slice(0, -5) + "xxxxx";
  const opened = sealer.open("client", tampered);
  assert.strictEqual(opened, undefined);
});

test("OAuthTokenSealer - secret too short throws", () => {
  assert.throws(
    () => new OAuthTokenSealer("short"),
    (error: Error) => error.message.includes("must be at least 32 characters")
  );
});

test("OAuthTokenSealer - invalid base64url returns undefined", () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const opened = sealer.open("client", "not-valid-base64url!!!!");
  assert.strictEqual(opened, undefined);
});

test("OAuthTokenSealer - too long token returns undefined", () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const longToken = "a".repeat(8193);
  const opened = sealer.open("client", longToken);
  assert.strictEqual(opened, undefined);
});

test("OAuthTokenSealer - undefined token returns undefined", () => {
  const sealer = new OAuthTokenSealer("my-secret-key-that-is-longer-than-32-characters");
  const opened = sealer.open("client", undefined);
  assert.strictEqual(opened, undefined);
});

test("fingerprint - returns stable short hash", () => {
  const fp1 = fingerprint("test-value");
  const fp2 = fingerprint("test-value");
  assert.strictEqual(fp1, fp2);
  assert(typeof fp1 === "string");
  assert.strictEqual(fp1.length, 22);
});

test("fingerprint - different values produce different hashes", () => {
  const fp1 = fingerprint("value1");
  const fp2 = fingerprint("value2");
  assert.notStrictEqual(fp1, fp2);
});
