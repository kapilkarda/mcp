/**
 * AI assistant tools: list, get, create and update assistants.
 *
 * Only text/basic settings are writable here. Voice, AI model and knowledge base
 * need provider-specific data that the QCall app's pickers build, so they are
 * changed in the app (the backend's full-record update would otherwise wipe them).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { APP_URL, E164_REGEX } from "../constants.js";
import { getApiClient } from "../services/qcall-api-client.js";
import { asList, errorResult, fmtFields, fmtTable, respond } from "../services/response-formatter.js";
import { readOnly, responseFormat, uuid, write } from "./tool-schema-helpers.js";
import { fetchNativeVoices } from "./assistant-payload.js";

const ASSISTANT_COLUMNS = ["id", "name", "company_name", "voice_name", "created_at"];
const ASSISTANT_DETAIL_FIELDS = [
  "id", "name", "company_name", "goal", "language", "voice_name", "voice_id", "ai_model_id", "knowledge_base_id",
  "start_speech", "end_call_message", "transfer_number", "maximum_time_per_call", "is_recording", "script"
];
const VOICE_NOTE = `Voice, AI model and knowledge base are set in the QCall app (${APP_URL} → Assistants).`;

// Matches the backend's PATCH /user/assistant whitelist.
const textFields = {
  name: z.string().min(1).max(200).describe("Assistant name"),
  goal: z.string().min(1).max(5000).describe("What the assistant must achieve on the call"),
  company_name: z.string().min(1).max(200).describe("Company the assistant represents"),
  script: z.string().min(1).max(50000).describe("Call script / instructions the assistant follows"),
  start_speech: z.string().max(2000).describe("First sentence spoken when the call connects"),
  end_call_message: z.string().max(2000).describe("What the assistant says before hanging up"),
  transfer_number: z.string().regex(E164_REGEX, "Use E.164 format, e.g. +919876543210").describe("Number to transfer to when the caller asks for a human (E.164)"),
  maximum_time_per_call: z.number().int().min(1).max(120).describe("Max call length in minutes"),
  is_recording: z.boolean().describe("Record calls")
};

const firstRow = (data: unknown) => (asList(data)[0] ?? data ?? {}) as Record<string, unknown>;

export function registerAssistantTools(server: McpServer): void {
  server.registerTool(
    "qcall_list_assistants",
    {
      title: "List AI assistants",
      description: "List the workspace's AI voice assistants. Use `id` as `assistant_id` in other tools (calls, campaigns).",
      inputSchema: { response_format: responseFormat },
      annotations: readOnly("List assistants")
    },
    async ({ response_format }) => {
      try {
        const res = await getApiClient().get("/user/listAssistant");
        const rows = asList(res.data);
        return respond(`**Assistants** (${rows.length})\n\n${fmtTable(rows, ASSISTANT_COLUMNS)}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_get_assistant",
    {
      title: "Get AI assistant",
      description: "Get one assistant's configuration (goal, script, greeting, voice, model, transfer number...).",
      inputSchema: { assistant_id: uuid("Assistant id from qcall_list_assistants"), response_format: responseFormat },
      annotations: readOnly("Get assistant")
    },
    async ({ assistant_id, response_format }) => {
      try {
        const res = await getApiClient().get("/user/getAssistant", { assistant_id });
        return respond(`**Assistant**\n${fmtFields(firstRow(res.data), ASSISTANT_DETAIL_FIELDS)}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_list_voices",
    {
      title: "List voices",
      description: "List QCall native voices (the app's default voice list) with voice_id, name, language, gender and accent. Pass voice_id to qcall_create_assistant to use a specific voice.",
      inputSchema: {
        language: z.string().max(10).optional().describe("Language code filter, e.g. 'hi', 'en'"),
        gender: z.enum(["male", "female"]).optional(),
        limit: z.number().int().min(1).max(200).default(30),
        response_format: responseFormat
      },
      annotations: readOnly("List voices")
    },
    async ({ language, gender, limit, response_format }) => {
      try {
        const voices = await fetchNativeVoices(getApiClient());
        const rows = voices
          .filter((v) => (!language || String(v.labels?.language ?? "").toLowerCase() === language.toLowerCase()) && (!gender || String(v.labels?.gender ?? "").toLowerCase() === gender))
          .map((v) => ({ voice_id: v.voice_id, name: v.name, language: v.labels?.language_name ?? v.labels?.language, gender: v.labels?.gender, accent: v.labels?.accent }));
        const shown = rows.slice(0, limit);
        return respond(`**Voices** (${rows.length} match, showing ${shown.length})\n\n${fmtTable(shown, ["voice_id", "name", "language", "gender", "accent"])}`, shown, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_update_assistant",
    {
      title: "Update AI assistant",
      description: `Change an assistant's text/basic settings. Only the fields you pass change. ${VOICE_NOTE}`,
      inputSchema: {
        assistant_id: uuid("Assistant id"),
        ...z.object(textFields).partial().shape
      },
      annotations: write("Update assistant", { idempotent: true })
    },
    async ({ assistant_id, ...changes }) => {
      try {
        const res = await getApiClient().patch("/user/assistant", changes, { id: assistant_id });
        const data = firstRow(res.data);
        const fields = Array.isArray(data.updated_fields) ? data.updated_fields.join(", ") : Object.keys(changes).join(", ");
        return respond(`**Assistant updated** — changed: ${fields}`, res);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
