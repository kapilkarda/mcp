/**
 * AI campaign tools: list, create, start, pause and resume bulk-calling campaigns.
 * Starting/resuming dials every contact in the list and spends wallet balance,
 * so both require an explicit `confirm: true`.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getApiClient } from "../services/qcall-api-client.js";
import { asList, errorResult, fmtPaging, fmtTable, respond } from "../services/response-formatter.js";
import { confirm, page, perpage, readOnly, responseFormat, uuid, write } from "./tool-schema-helpers.js";

const campaignId = uuid("Campaign id from qcall_list_campaigns");

export function registerCampaignTools(server: McpServer): void {
  server.registerTool(
    "qcall_list_campaigns",
    {
      title: "List campaigns",
      description: "List AI calling campaigns with their status.",
      inputSchema: { page, perpage, response_format: responseFormat },
      annotations: readOnly("Campaigns")
    },
    async ({ response_format, ...query }) => {
      try {
        const res = await getApiClient().get("/campaign/list", query);
        const rows = asList(res.data);
        const columns = rows[0] ? ["id", "campaigns_name", "campaign_status", "assistant_name", "contact_name", "dialer_name", "created_at"].filter((c) => c in rows[0]) : [];
        return respond(`**Campaigns**\n\n${fmtTable(rows, columns)}${fmtPaging(res, query.page)}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_create_campaign",
    {
      title: "Create campaign",
      description:
        "Create an AI calling campaign that calls every contact in a list with an assistant. It is created but NOT started — use qcall_start_campaign after the user approves.",
      inputSchema: {
        campaigns_name: z.string().min(1).max(200).describe("Campaign name"),
        assistant_id: uuid("Assistant id"),
        segment_id: uuid("Contact list id"),
        dialer_id: z.string().describe("Dialer id from qcall_list_dialers"),
        retry_count: z.number().int().min(0).max(5).optional().describe("Retries for unanswered calls"),
        retry_time: z.number().int().min(1).max(1440).optional().describe("Minutes between retries"),
        timezone: z.string().max(64).optional().describe("IANA timezone, e.g. 'Asia/Kolkata'")
      },
      annotations: write("Create campaign")
    },
    async (body) => {
      try {
        const res = await getApiClient().post("/campaign/create", body);
        const created = (asList(res.data)[0] ?? res.data ?? {}) as Record<string, unknown>;
        return respond(`**Campaign created** (not started): ${body.campaigns_name}${created.id ?? created.hash_id ? ` — id \`${created.id ?? created.hash_id}\`` : ""}. ${res.message ?? ""}`, res);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_start_campaign",
    {
      title: "Start campaign",
      description: "Start a campaign: the assistant begins calling every contact in its list, billed to the wallet. Confirm with the user first, then set confirm=true.",
      inputSchema: { campaign_id: campaignId, confirm: confirm("starting this campaign") },
      annotations: write("Start campaign")
    },
    async ({ campaign_id }) => {
      try {
        const res = await getApiClient().post("/campaign/start", {}, { id: campaign_id });
        return respond(`**Campaign started.** ${res.message ?? ""}`, res);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_pause_campaign",
    {
      title: "Pause campaign",
      description: "Pause a running campaign (no new calls are placed until resumed).",
      inputSchema: { campaign_id: campaignId },
      annotations: write("Pause campaign", { idempotent: true })
    },
    async ({ campaign_id }) => {
      try {
        const res = await getApiClient().put("/campaign/pauseCampaign", {}, { id: campaign_id });
        return respond(`**Campaign paused.** ${res.message ?? ""}`, res);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_resume_campaign",
    {
      title: "Resume campaign",
      description: "Resume a paused campaign; calls continue and are billed to the wallet. Confirm with the user first, then set confirm=true.",
      inputSchema: { campaign_id: campaignId, confirm: confirm("resuming this campaign") },
      annotations: write("Resume campaign", { idempotent: true })
    },
    async ({ campaign_id }) => {
      try {
        const res = await getApiClient().put("/campaign/resumeCampaign", {}, { id: campaign_id });
        return respond(`**Campaign resumed.** ${res.message ?? ""}`, res);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
