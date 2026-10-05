/**
 * Call tools: place a single outbound AI call, list call history, read transcripts,
 * and list the phone numbers / dialers calls can be placed from.
 *
 * Placing a call spends wallet balance and rings a real phone, so it requires an
 * explicit `confirm: true` that the model may only set after the user agreed.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { E164_REGEX, PLACE_CALL_MAX_NUMBERS } from "../constants.js";
import { getApiClient } from "../services/qcall-api-client.js";
import { asList, errorResult, fmtFields, fmtPaging, fmtTable, respond } from "../services/response-formatter.js";
import { confirm, page, perpage, readOnly, responseFormat, uuid, write } from "./tool-schema-helpers.js";

const CALL_COLUMNS = ["call_sid", "phone_number", "first_name", "assistant_name", "call_status", "call_duration_in_sec", "call_cost", "call_sentiment", "created_at"];
const sentiment = z.enum(["all", "positive", "negative", "neutral"]).default("all");

/** Keeps the listed columns that exist in the rows (endpoints differ slightly). */
const presentColumns = (rows: Array<Record<string, unknown>>, preferred: string[]) =>
  rows[0] ? preferred.filter((c) => c in rows[0]) : preferred;

export function registerCallTools(server: McpServer): void {
  server.registerTool(
    "qcall_place_call",
    {
      title: "Place an AI call",
      description: `Start an outbound call where a QCall assistant talks to the person. Rings a real phone and is billed to the wallet.

Before calling: confirm the number(s), assistant and cost with the user, then set confirm=true. Get assistant_id from qcall_list_assistants and dialer_id (optional; default dialer otherwise) from qcall_list_dialers.`,
      inputSchema: {
        phone_numbers: z
          .array(z.string().regex(E164_REGEX, "Use E.164 format, e.g. +919876543210"))
          .min(1)
          .max(PLACE_CALL_MAX_NUMBERS)
          .describe(`Numbers to call in E.164 format (max ${PLACE_CALL_MAX_NUMBERS})`),
        assistant_id: uuid("Assistant id"),
        dialer_id: z.string().optional().describe("Dialer/number id to call from (qcall_list_dialers); omit for default"),
        first_name: z.string().max(100).optional().describe("Callee first name (used in the script)"),
        last_name: z.string().max(100).optional(),
        email: z.string().email().optional(),
        description: z.string().max(1000).optional().describe("Context about the callee for the assistant"),
        confirm: confirm("placing this call")
      },
      annotations: write("Place call")
    },
    async ({ phone_numbers, confirm: _confirmed, ...rest }) => {
      try {
        const res = await getApiClient().post("/playground/call", { ...rest, phone_number: phone_numbers });
        const placed = asList(res.data);
        const body = placed.length ? `\n\n${fmtTable(placed, presentColumns(placed, ["call_sid", "phone_number", "status"]))}` : "";
        return respond(`**Call started** to ${phone_numbers.join(", ")}. ${res.message ?? ""}${body}\n\nUse qcall_list_calls to follow its status.`, res);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_list_calls",
    {
      title: "List calls",
      description: "List single calls placed from the playground/API (newest first) with status, duration, cost and sentiment. Use response_format=json to read each call's transcript (`call_transcribe`) and `recording_url`.",
      inputSchema: {
        status: z.enum(["all", "completed", "inProgress", "failed"]).default("all"),
        sentiment,
        page,
        perpage,
        response_format: responseFormat
      },
      annotations: readOnly("List calls")
    },
    async ({ response_format, ...query }) => {
      try {
        const res = await getApiClient().get("/playground/list", query);
        const rows = asList(res.data);
        return respond(`**Calls**\n\n${fmtTable(rows, presentColumns(rows, CALL_COLUMNS))}${fmtPaging(res, query.page)}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_list_campaign_call_logs",
    {
      title: "List campaign call logs",
      description: "List calls made by campaigns across the workspace. Dates are YYYY-MM-DD.",
      inputSchema: {
        status: z.string().max(30).default("all").describe("'all' or a call status such as 'completed', 'failed', 'no-answer'"),
        sentiment,
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        page,
        perpage,
        response_format: responseFormat
      },
      annotations: readOnly("Campaign call logs")
    },
    async ({ response_format, ...query }) => {
      try {
        const res = await getApiClient().get("/campaign/callLogs", query);
        const rows = asList(res.data);
        const columns = presentColumns(rows, ["callsid", "phone", "first_name", "campaigns_name", "call_status", "call_duration_in_sec", "call_sentiment", "created_at"]);
        return respond(`**Campaign call logs**\n\n${fmtTable(rows, columns)}${fmtPaging(res, query.page)}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_get_call_transcript",
    {
      title: "Get call transcript",
      description: "Get the transcript, recording URL and duration of a campaign call by its call SID (`callsid` from qcall_list_campaign_call_logs). For single calls, the transcript is already in qcall_list_calls (json).",
      inputSchema: { call_sid: z.string().regex(/^[A-Za-z0-9_-]{3,100}$/, "Invalid call SID").describe("Call SID"), response_format: responseFormat },
      annotations: readOnly("Call transcript")
    },
    async ({ call_sid, response_format }) => {
      try {
        const res = await getApiClient().get(`/activity/${encodeURIComponent(call_sid)}/transcript`);
        const data = (res.data ?? {}) as Record<string, unknown>;
        const transcript = typeof data.transcript === "string" ? data.transcript : JSON.stringify(data.transcript ?? "", null, 1);
        const meta = fmtFields(data, ["call_sid", "title", "duration_sec", "recording_url"]);
        return respond(`**Call ${call_sid}**\n${meta}\n\n**Transcript**\n${transcript || "_No transcript yet._"}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_list_phone_numbers",
    {
      title: "List phone numbers",
      description: "List phone numbers the workspace owns in QCall.",
      inputSchema: { response_format: responseFormat },
      annotations: readOnly("Phone numbers")
    },
    async ({ response_format }) => {
      try {
        const res = await getApiClient().get("/did/my-numbers");
        const rows = asList(res.data);
        const columns = rows[0] ? Object.keys(rows[0]).filter((k) => /id|number|country|status|renew|expir/i.test(k)).slice(0, 6) : [];
        return respond(`**Phone numbers** (${rows.length})\n\n${fmtTable(rows, columns)}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_list_dialers",
    {
      title: "List dialers",
      description: "List dialers (caller numbers / carrier connections) usable as `dialer_id` for calls and campaigns. Credentials are never returned.",
      inputSchema: { response_format: responseFormat },
      annotations: readOnly("Dialers")
    },
    async ({ response_format }) => {
      try {
        const res = await getApiClient().get("/dialer/list");
        // Allow-list: dialer rows also carry SIP credentials, trunk ids and endpoint URLs.
        const SAFE_FIELDS = ["id", "name", "dialer_type", "phone_number", "provider", "status", "is_default", "created_at"];
        const rows = asList(res.data).map((row) => Object.fromEntries(SAFE_FIELDS.filter((k) => k in row).map((k) => [k, row[k]])));
        const columns = SAFE_FIELDS.filter((k) => rows[0] && k in rows[0] && k !== "created_at");
        return respond(`**Dialers** (${rows.length})\n\n${fmtTable(rows, columns)}`, rows, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
