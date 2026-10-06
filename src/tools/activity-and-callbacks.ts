/**
 * Activity feed and scheduled AI callbacks. "Call now" is not exposed (it
 * places a paid call outside the confirm flow); cancelling needs confirm=true.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getApiClient } from "../services/qcall-api-client.js";
import { asList, errorResult, fmtTable, respond } from "../services/response-formatter.js";
import { confirm, readOnly, responseFormat, uuid, write } from "./tool-schema-helpers.js";

export function registerActivityTools(server: McpServer): void {
  server.registerTool(
    "qcall_list_activities",
    {
      title: "List activities",
      description:
        "List the activity feed (call outcomes, follow-ups, meetings, tasks), newest first. Pass `cursor` from the previous result to load more.",
      inputSchema: {
        campaign_id: z.string().uuid().optional(),
        contact_id: z.string().uuid().optional(),
        track: z.enum(["ai", "human"]).optional(),
        status: z.string().max(30).optional().describe("e.g. pending, scheduled, completed"),
        from: z.string().max(30).optional().describe("ISO date/time"),
        to: z.string().max(30).optional().describe("ISO date/time"),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().max(200).optional(),
        response_format: responseFormat
      },
      annotations: readOnly("List activities")
    },
    async ({ response_format, ...query }) => {
      try {
        const res = await getApiClient().get("/activity/list", query);
        const data = (res.data ?? {}) as { items?: Array<Record<string, unknown>>; nextCursor?: string };
        const rows = (data.items ?? []).map((i) => ({
          id: i.id,
          title: i.title,
          type: i.type,
          status: i.status,
          contact: (i.contact as Record<string, unknown> | undefined)?.name,
          campaign: (i.campaign as Record<string, unknown> | undefined)?.name
        }));
        const more = data.nextCursor ? `\n\n_More: pass cursor \`${data.nextCursor}\`_` : "";
        return respond(`**Activities**\n\n${fmtTable(rows, ["id", "title", "type", "status", "contact", "campaign"])}${more}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_list_callbacks",
    {
      title: "List AI callbacks",
      description: "List scheduled AI callbacks (calls the assistant promised to make back), with time and status.",
      inputSchema: {
        status: z.string().max(30).optional().describe("e.g. pending, dispatched, cancelled"),
        contact_id: z.string().uuid().optional(),
        response_format: responseFormat
      },
      annotations: readOnly("List callbacks")
    },
    async ({ response_format, ...query }) => {
      try {
        const res = await getApiClient().get("/ai-callbacks", query);
        return respond(`**AI callbacks**\n\n${fmtTable(asList(res.data), ["hash_id", "contact_id", "callback_at", "status", "attempts", "outcome"])}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_reschedule_callback",
    {
      title: "Reschedule AI callback",
      description: "Move a pending AI callback to a new time (future, within 30 days). The assistant will call at the new time.",
      inputSchema: {
        callback_id: uuid("Callback hash_id from qcall_list_callbacks"),
        callback_at: z.string().datetime({ offset: true }).describe("New time, ISO 8601 with timezone, e.g. 2026-10-07T10:00:00+05:30")
      },
      annotations: write("Reschedule callback", { idempotent: true })
    },
    async ({ callback_id, callback_at }) => {
      try {
        const res = await getApiClient().patch(`/ai-callbacks/${encodeURIComponent(callback_id)}`, { callback_at });
        return respond(`**Callback rescheduled** to ${callback_at}. ${res.message ?? ""}`, res);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_cancel_callback",
    {
      title: "Cancel AI callback",
      description: "Cancel a pending AI callback so the assistant does not call back. Confirm with the user first, then set confirm=true.",
      inputSchema: { callback_id: uuid("Callback hash_id"), confirm: confirm("cancelling this callback") },
      annotations: write("Cancel callback", { destructive: true, idempotent: true })
    },
    async ({ callback_id }) => {
      try {
        const res = await getApiClient().delete(`/ai-callbacks/${encodeURIComponent(callback_id)}`);
        return respond(`**Callback cancelled.** ${res.message ?? ""}`, res);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
