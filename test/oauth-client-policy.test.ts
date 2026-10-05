import { test } from "node:test";
import assert from "node:assert";
import { redirectUriPolicyError, isTrustedRedirect, sanitizeClientName } from "../src/oauth/oauth-client-policy.js";

test("redirectUriPolicyError - https accepted", () => {
  assert.strictEqual(redirectUriPolicyError("https://claude.ai/callback"), undefined);
  assert.strictEqual(redirectUriPolicyError("https://example.com/oauth"), undefined);
});

test("redirectUriPolicyError - http loopback accepted", () => {
  assert.strictEqual(redirectUriPolicyError("http://localhost:3000/callback"), undefined);
  assert.strictEqual(redirectUriPolicyError("http://127.0.0.1:8080/callback"), undefined);
  assert.strictEqual(redirectUriPolicyError("http://[::1]:3000/callback"), undefined);
});

test("redirectUriPolicyError - http non-loopback rejected", () => {
  const error = redirectUriPolicyError("http://example.com/callback");
  assert(error !== undefined);
  assert(error.includes("https"));
});

test("redirectUriPolicyError - fragment rejected", () => {
  const error = redirectUriPolicyError("https://example.com/callback#fragment");
  assert(error !== undefined);
  assert(error.includes("fragment"));
});

test("redirectUriPolicyError - custom schemes accepted", () => {
  assert.strictEqual(redirectUriPolicyError("vscode://auth"), undefined);
  assert.strictEqual(redirectUriPolicyError("cursor://callback"), undefined);
  assert.strictEqual(redirectUriPolicyError("vscode-insiders://auth"), undefined);
  assert.strictEqual(redirectUriPolicyError("windsurf://callback"), undefined);
  assert.strictEqual(redirectUriPolicyError("claude://callback"), undefined);
});

test("redirectUriPolicyError - javascript rejected", () => {
  const error = redirectUriPolicyError("javascript://evil");
  assert(error !== undefined);
});

test("redirectUriPolicyError - invalid URL rejected", () => {
  const error = redirectUriPolicyError("not a valid url");
  assert(error !== undefined);
  assert(error.includes("Invalid"));
});

test("isTrustedRedirect - claude.ai and chatgpt.com trusted", () => {
  assert.strictEqual(isTrustedRedirect("https://claude.ai/callback"), true);
  assert.strictEqual(isTrustedRedirect("https://claude.com/chat"), true);
  assert.strictEqual(isTrustedRedirect("https://chatgpt.com/auth"), true);
  assert.strictEqual(isTrustedRedirect("https://chat.openai.com/callback"), true);
  assert.strictEqual(isTrustedRedirect("https://platform.openai.com/auth"), true);
});

test("isTrustedRedirect - unknown https not trusted", () => {
  assert.strictEqual(isTrustedRedirect("https://evil.com/callback"), false);
});

test("isTrustedRedirect - loopback always trusted", () => {
  assert.strictEqual(isTrustedRedirect("http://localhost:3000/callback"), true);
  assert.strictEqual(isTrustedRedirect("http://127.0.0.1:8080/callback"), true);
});

test("isTrustedRedirect - custom schemes always trusted", () => {
  assert.strictEqual(isTrustedRedirect("vscode://auth"), true);
  assert.strictEqual(isTrustedRedirect("cursor://callback"), true);
});

test("sanitizeClientName - normal name preserved", () => {
  assert.strictEqual(sanitizeClientName("My App"), "My App");
});

test("sanitizeClientName - strips control characters", () => {
  const name = "My\u0000App\u001fTest";
  const cleaned = sanitizeClientName(name);
  assert.strictEqual(cleaned, "MyAppTest");
});

test("sanitizeClientName - strips bidi characters", () => {
  const name = "My‮App";
  const cleaned = sanitizeClientName(name);
  assert.strictEqual(cleaned, "MyApp");
});

test("sanitizeClientName - collapses whitespace", () => {
  const cleaned = sanitizeClientName("My   App   Name");
  assert.strictEqual(cleaned, "My App Name");
});

test("sanitizeClientName - caps length at 60", () => {
  const name = "a".repeat(100);
  const cleaned = sanitizeClientName(name);
  assert.strictEqual(cleaned?.length, 60);
});

test("sanitizeClientName - returns undefined for empty/blank", () => {
  assert.strictEqual(sanitizeClientName(""), undefined);
  assert.strictEqual(sanitizeClientName("   "), undefined);
  assert.strictEqual(sanitizeClientName(undefined), undefined);
});

test("sanitizeClientName - normalizes unicode", () => {
  const name = "Café";
  const cleaned = sanitizeClientName(name);
  assert(cleaned !== undefined && cleaned.length > 0);
});
