/**
 * Knowledge base (list / create from text) and dashboard analytics tools.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getApiClient } from "../services/qcall-api-client.js";
import { asList, errorResult, fmtFields, fmtTable, respond } from "../services/response-formatter.js";
import { readOnly, responseFormat, write } from "./tool-schema-helpers.js";

export function registerKnowledgeAndAnalyticsTools(server: McpServer): void {
  server.registerTool(
    "qcall_list_knowledge_bases",
    {
      title: "List knowledge bases",
      description: "List knowledge bases. Attach one to an assistant via `knowledge_base_Id` (hash_id).",
      inputSchema: { response_format: responseFormat },
      annotations: readOnly("Knowledge bases")
    },
    async ({ response_format }) => {
      try {
        const res = await getApiClient().get("/knowledgeBase/list");
        const rows = asList(res.data);
        const columns = rows[0] ? ["hash_id", "title", "language", "status", "created_at"].filter((c) => c in rows[0]) : [];
        return respond(`**Knowledge bases** (${rows.length})\n\n${fmtTable(rows, columns)}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_create_knowledge_base",
    {
      title: "Create knowledge base",
      description:
        "Create a knowledge base from question/answer pairs (FAQs, prices, policies, opening hours) that assistants answer from. Turn source text into clear Q&A pairs first. Document uploads are done in the QCall app.",
      inputSchema: {
        title: z.string().min(1).max(200),
        faqs: z
          .array(
            z.object({
              question: z.string().min(1).max(1000),
              answer: z.string().min(1).max(5000)
            })
          )
          .min(1)
          .max(500)
          .describe("Question/answer pairs"),
        language: z.string().max(20).default("en").describe("Language code, e.g. 'en', 'hi'")
      },
      annotations: write("Create knowledge base")
    },
    async ({ title, faqs, language }) => {
      try {
        const res = await getApiClient().post("/knowledgeBase/create", { title, language, data: faqs });
        const created = (asList(res.data)[0] ?? res.data ?? {}) as Record<string, unknown>;
        return respond(`**Knowledge base created**: ${title} (${faqs.length} Q&A pairs, indexing in background)\n${fmtFields(created, ["hash_id", "status"])}`, res);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_get_dashboard_stats",
    {
      title: "Get dashboard statistics",
      description: "Get workspace call statistics (totals, answered, minutes, spend) as shown on the QCall dashboard.",
      inputSchema: { response_format: responseFormat },
      annotations: readOnly("Dashboard statistics")
    },
    async ({ response_format }) => {
      try {
        const res = await getApiClient().get("/dashboard/statistics");
        const data = res.data;
        const markdown = Array.isArray(data)
          ? fmtTable(asList(data), Object.keys(asList(data)[0] ?? {}).slice(0, 8))
          : fmtFields(data as Record<string, unknown>, Object.keys((data ?? {}) as object).slice(0, 30));
        return respond(`**Dashboard statistics**\n${markdown || "_No data._"}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
