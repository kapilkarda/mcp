#!/usr/bin/env node
/**
 * QCall MCP server (stdio entry) — for Claude Desktop, Claude Code, Cursor and
 * other local MCP clients. For the hosted endpoint see http-server.ts.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initProcessApiClient } from "./services/qcall-api-client.js";
import { DEFAULT_API_BASE_URL } from "./constants.js";
import { createQcallMcpServer } from "./create-qcall-mcp-server.js";

async function main() {
  const apiBaseUrl = process.env.QCALL_API_BASE_URL || DEFAULT_API_BASE_URL;
  const apiKey = process.env.QCALL_API_KEY;

  if (!apiKey) {
    console.error("ERROR: QCALL_API_KEY environment variable is required.");
    console.error("Create one in QCall → Integrations → AI Assistants (MCP), then:");
    console.error("  export QCALL_API_KEY=qc_live_your_key_here");
    console.error(`Optional: export QCALL_API_BASE_URL=${DEFAULT_API_BASE_URL}`);
    process.exit(1);
  }

  initProcessApiClient({ baseURL: apiBaseUrl, apiKey });
  const server = createQcallMcpServer();

  // stdout is reserved for the MCP protocol: log to stderr only.
  console.error(`QCall MCP server starting (API: ${apiBaseUrl})`);
  await server.connect(new StdioServerTransport());
  console.error("QCall MCP server running via stdio");
}

main().catch((error) => {
  console.error("Fatal server error:", error);
  process.exit(1);
});
