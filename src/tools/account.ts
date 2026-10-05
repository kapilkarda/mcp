/**
 * Account tools: wallet balance, active plan and wallet transactions.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getApiClient } from "../services/qcall-api-client.js";
import { asList, errorResult, fmtFields, fmtTable, respond } from "../services/response-formatter.js";
import { readOnly, responseFormat } from "./tool-schema-helpers.js";

export function registerAccountTools(server: McpServer): void {
  server.registerTool(
    "qcall_get_balance",
    {
      title: "Get wallet balance",
      description:
        "Get the QCall wallet balance of the connected workspace. Calls and campaigns are billed from this wallet; check it before placing calls.\n\nReturns: `amount`, `currency`.",
      inputSchema: { response_format: responseFormat },
      annotations: readOnly("Wallet balance")
    },
    async ({ response_format }) => {
      try {
        const res = await getApiClient().get("/user/amount");
        const data = (res.data || {}) as Record<string, unknown>;
        return respond(`**Wallet balance:** ${data.amount ?? "?"} ${String(data.currency ?? "").toUpperCase()}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_get_active_plan",
    {
      title: "Get active plan",
      description: "Get the workspace's active QCall subscription plan (name, limits, renewal).",
      inputSchema: { response_format: responseFormat },
      annotations: readOnly("Active plan")
    },
    async ({ response_format }) => {
      try {
        const res = await getApiClient().get("/activePlanDetails");
        const data = res.data as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
        const plan = Array.isArray(data) ? data[0] : data;
        const markdown = plan ? `**Active plan**\n${fmtFields(plan, Object.keys(plan).slice(0, 25))}` : "_No active plan._";
        return respond(markdown, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_list_transactions",
    {
      title: "List wallet transactions",
      description: "List recent wallet transactions (top-ups and charges) for the workspace.",
      inputSchema: { response_format: responseFormat },
      annotations: readOnly("Wallet transactions")
    },
    async ({ response_format }) => {
      try {
        const res = await getApiClient().get("/user/transactionHistoryList");
        const rows = asList(res.data);
        const columns = rows[0] ? Object.keys(rows[0]).slice(0, 6) : [];
        return respond(`**Transactions** (${rows.length})\n\n${fmtTable(rows.slice(0, 50), columns)}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
