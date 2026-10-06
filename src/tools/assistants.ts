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
    "qcall_create_assistant",
    {
      title: "Create AI assistant",
      description: `Create an AI voice assistant from a name, goal, company and call script. ${VOICE_NOTE} Until a voice is chosen the workspace default is used.`,
      inputSchema: {
        name: textFields.name,
        goal: textFields.goal,
        company_name: textFields.company_name,
        script: textFields.script,
        start_speech: textFields.start_speech.optional(),
        transfer_number: textFields.transfer_number.optional(),
        maximum_time_per_call: textFields.maximum_time_per_call.optional(),
        language: z.string().max(20).optional().describe("Language code, e.g. 'en-US', 'hi-IN'")
      },
      annotations: write("Create assistant")
    },
    async (params) => {
      try {
        const api = getApiClient();
        const res = await api.post("/user/createAssistant", { ...params, is_call_flow: false });
        // The create response carries no id; look the new assistant up by name (newest wins).
        const list = asList((await api.get("/user/listAssistant")).data);
        const created = list
          .filter((a) => a.name === params.name)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        const id = created?.id ? ` — id \`${created.id}\`` : "";
        return respond(`**Assistant created**: ${params.name}${id}. ${res.message ?? ""}\n\n${VOICE_NOTE}`, { ...res, assistant: created });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_list_voices",
    {
      title: "List voices",
      description: `List voices available for QCall assistants (name, language, gender, accent). ${VOICE_NOTE}`,
      inputSchema: {
        language: z.string().max(20).optional().describe("Language filter, e.g. 'hi', 'en' (substring match)"),
        gender: z.enum(["male", "female"]).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        response_format: responseFormat
      },
      annotations: readOnly("List voices")
    },
    async ({ language, gender, limit, response_format }) => {
      try {
        const res = await getApiClient().get("/user/voices");
        const text = (v: unknown) => String(v ?? "").toLowerCase();
        const rows = asList(res.data).filter(
          (v) =>
            (!language || text(v.language ?? v.lang ?? v.locale).includes(language.toLowerCase())) &&
            (!gender || text(v.gender) === gender)
        );
        const shown = rows.slice(0, limit);
        const columns = shown[0] ? Object.keys(shown[0]).filter((k) => /^(id|name|displayname|language|gender|accent|provider)$/i.test(k)) : [];
        return respond(`**Voices** (${rows.length} match, showing ${shown.length})\n\n${fmtTable(shown, columns)}`, shown, response_format);
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
