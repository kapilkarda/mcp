#!/usr/bin/env node
/**
 * Smoke test for the hosted MCP endpoint using the official MCP SDK client.
 *
 *   MCP_URL=https://mcp.qcall.ai/mcp QCALL_API_KEY=qc_live_... node scripts/smoke-test-http-mcp-server.mjs
 *
 * Checks: 401 challenge without a token, initialize + tools/list, spend tools
 * require confirm, and one read-only tool call (qcall_get_balance).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const mcpUrl = process.env.MCP_URL || "http://localhost:8788/mcp";
const apiKey = process.env.QCALL_API_KEY;
const SPEND_TOOLS = ["qcall_place_call", "qcall_start_campaign", "qcall_resume_campaign"];

if (!apiKey) {
  console.error("QCALL_API_KEY is required");
  process.exit(1);
}

async function checkUnauthorizedChallenge() {
  const res = await fetch(mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
  });
  const challenge = res.headers.get("www-authenticate") || "";
  if (res.status !== 401 || !challenge.includes("resource_metadata=")) {
    throw new Error(`Expected 401 with resource_metadata challenge, got ${res.status} "${challenge}"`);
  }
  console.log("✔ 401 + WWW-Authenticate challenge without token");
}

async function checkToolsWithKey() {
  const client = new Client({ name: "qcall-smoke-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } }
  });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(`✔ tools/list returned ${tools.length} tools`);

  for (const name of SPEND_TOOLS) {
    const tool = tools.find((t) => t.name === name);
    if (!tool?.inputSchema?.required?.includes("confirm")) throw new Error(`${name} must require confirm`);
  }
  console.log(`✔ spend tools require confirm: ${SPEND_TOOLS.join(", ")}`);

  const result = await client.callTool({ name: "qcall_get_balance", arguments: {} });
  if (result.isError) throw new Error(`Tool call failed: ${JSON.stringify(result.content)}`);
  console.log(`✔ qcall_get_balance: ${JSON.stringify(result.content).slice(0, 200)}`);

  await client.close();
}

try {
  await checkUnauthorizedChallenge();
  await checkToolsWithKey();
  console.log(`All checks passed for ${mcpUrl}`);
} catch (error) {
  console.error(`✘ ${error.message}`);
  process.exit(1);
}
