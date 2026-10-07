/**
 * qcall_create_assistant: creates an outbound or inbound voice assistant exactly
 * like the QCall app (same payload, defaults, native voice, default image and
 * tool/action JSON). The model asks the user for every required value, writes
 * the script/messages/prompts itself, shows a summary and only then calls this.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { E164_REGEX } from "../constants.js";
import { getApiClient } from "../services/qcall-api-client.js";
import { asList, errorResult, respond } from "../services/response-formatter.js";
import { APP_GOALS, LANGUAGE_CODES } from "./assistant-app-data.js";
import { bookingAction, transferAction, webhookAction } from "./assistant-actions.js";
import { buildAssistantPayload, defaultAiModelId, fetchNativeVoices, pickVoice, DEFAULT_ASSISTANT_IMAGE } from "./assistant-payload.js";
import { confirm, write } from "./tool-schema-helpers.js";

const DESCRIPTION = `Create a QCall voice assistant (outbound or inbound) exactly like the QCall app does.

BEFORE calling, ASK THE USER for every one of these (never guess or invent them):
1. type: outbound (it calls people) or inbound (it answers calls)
2. name: assistant name shown in QCall
3. agent name: the name the AI introduces itself with on calls (use it in start_speech and script)
4. company_name
5. goal: one of — ${APP_GOALS.join("; ")} — or the user's own goal text
6. languages: which language(s) the assistant speaks
7. gender of the voice: male or female (a matching QCall native voice is chosen; or let the user pick one from qcall_list_voices and pass voice_id)
8. maximum_time_per_call: max call length in minutes
9. a short description of the business/offer and what a successful call looks like
10. inbound only: which phone number/dialer receives the calls (dialer_id from qcall_list_dialers)
Then ask whether they want tools, and only for the tools they want ask the tool's details:
 - call transfer: number(s) with country code (E.164), when to transfer, what to say before transferring
 - booking/scheduling: provider (openBooking = QCall built-in, cal.com needs API key + event id, google_calendar or gohighlevel need calendar id), when to offer booking, days and hours (e.g. 09:00 AM–05:00 PM), time zone for external calendars
 - webhook: name, URL, call start and/or call end
 Email, SMS, WhatsApp and CRM sync need setup in the QCall app first: tell the user to add them in the app.

YOU WRITE (from the answers): script (the full call prompt the agent follows, in the assistant's language), start_speech (opening line, max 250 characters, may use @[FirstName](firstName)), meeting_note_prompt (what to capture as meeting notes) and call_outcome_prompt (how to classify the call outcome).
Everything else (voice settings, AI model, closing message, profile image, recording, timings) is filled with the QCall app's defaults.

Show the user a summary of ALL values including the generated texts, get explicit approval, then call with confirm=true.`;

export function registerAssistantCreateTool(server: McpServer): void {
  server.registerTool(
    "qcall_create_assistant",
    {
      title: "Create AI assistant",
      description: DESCRIPTION,
      inputSchema: {
        type: z.enum(["outbound", "inbound"]),
        name: z.string().min(1).max(100).describe("Assistant name"),
        agent_name: z.string().min(1).max(60).describe("Name the agent uses on calls"),
        company_name: z.string().min(1).max(200),
        goal: z.string().min(1).max(2000).describe("One of the QCall goals or the user's own goal"),
        languages: z.array(z.enum(LANGUAGE_CODES)).min(1).max(5).describe(`Language codes: ${LANGUAGE_CODES.join(", ")}`),
        gender: z.enum(["male", "female"]),
        voice_id: z.string().max(100).optional().describe("QCall native voice id from qcall_list_voices (optional)"),
        maximum_time_per_call: z.number().int().min(1).max(120).describe("Minutes"),
        script: z.string().min(50).max(30000).describe("Full call prompt written by you from the user's answers"),
        start_speech: z.string().min(1).max(250).describe("Opening line"),
        meeting_note_prompt: z.string().min(10).max(3000),
        call_outcome_prompt: z.string().min(10).max(3000),
        company_website: z.string().url().optional(),
        knowledge_base_ids: z.array(z.string().uuid()).max(5).optional().describe("Ready knowledge bases (qcall_list_knowledge_bases)"),
        dialer_id: z.string().optional().describe("Inbound only: dialer/number that receives calls"),
        transfer: z
          .object({
            numbers: z.array(z.string().regex(E164_REGEX, "E.164, e.g. +919876543210")).min(1).max(5),
            condition: z.string().min(3).max(500),
            say: z.string().max(300).optional()
          })
          .optional(),
        booking: z
          .object({
            provider: z.enum(["openBooking", "cal.com", "google_calendar", "gohighlevel"]),
            condition: z.string().min(3).max(500).describe("When to offer booking"),
            say: z.string().max(300).optional(),
            timezone: z.string().max(64).optional().describe("IANA time zone (external calendars)"),
            start_day_offset: z.number().int().min(0).max(5).optional().describe("Earliest bookable day: 0 = today"),
            booking_days: z.array(z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])).min(1).optional(),
            start_time: z.string().regex(/^\d{1,2}:\d{2} (AM|PM)$/, "e.g. 09:00 AM").optional(),
            end_time: z.string().regex(/^\d{1,2}:\d{2} (AM|PM)$/, "e.g. 05:00 PM").optional(),
            calcom_api_key: z.string().max(200).optional(),
            calcom_event_id: z.string().max(50).optional(),
            calendar_id: z.string().max(200).optional(),
            slot_minutes: z.number().int().min(10).max(240).optional()
          })
          .optional(),
        webhooks: z
          .array(
            z.object({
              name: z.string().min(1).max(100),
              url: z.string().url(),
              method: z.enum(["GET", "POST"]).optional(),
              on_call_start: z.boolean().optional(),
              on_call_end: z.boolean().optional()
            })
          )
          .max(5)
          .optional(),
        confirm: confirm("the full assistant summary")
      },
      annotations: write("Create assistant")
    },
    async (input) => {
      try {
        if (input.type === "inbound" && !input.dialer_id) throw new Error("Inbound assistants need dialer_id (the number that receives calls).");
        if (input.booking?.provider === "cal.com" && !(input.booking.calcom_api_key && input.booking.calcom_event_id)) throw new Error("cal.com booking needs calcom_api_key and calcom_event_id.");
        if (input.booking && ["google_calendar", "gohighlevel"].includes(input.booking.provider) && !input.booking.calendar_id) throw new Error(`${input.booking.provider} booking needs calendar_id.`);

        const api = getApiClient();
        const [voices, aiModelId] = await Promise.all([fetchNativeVoices(api), defaultAiModelId(api)]);
        const voice = pickVoice(voices, input.languages[0], input.gender, input.voice_id);
        if (!voice) throw new Error(input.voice_id ? `Voice ${input.voice_id} not found; pick one from qcall_list_voices.` : "No QCall native voice found for this language/gender.");

        const actions: unknown[] = [];
        if (input.transfer) actions.push(transferAction(input.transfer));
        if (input.booking) actions.push(bookingAction(input.booking));
        if (input.webhooks?.length) actions.push(webhookAction(input.webhooks));

        const payload = buildAssistantPayload(input, voice, aiModelId, actions);
        const res = await api.post("/user/createAssistant", payload);
        // Newer backends return data.hash_id; otherwise find it by name + company.
        let id = (res.data as Record<string, unknown> | undefined)?.hash_id as string | undefined;
        if (!id) {
          const list = asList((await api.get("/user/listAssistant")).data);
          id = list.find((a) => a.name === input.name && a.company_name === input.company_name)?.id as string | undefined;
        }

        let inbound = "";
        if (input.type === "inbound" && id) {
          // The assistant exists either way; report a linking problem instead of failing the whole call.
          try {
            const linked = await api.post("/inbound/create", { name: input.name, assistant_id: id, dialer_id: input.dialer_id });
            inbound = `\n- **inbound number**: linked (${linked.message ?? "ok"})`;
          } catch (linkError) {
            inbound = `\n- **inbound number**: NOT linked — ${(linkError as Error).message}. Link it in QCall → Inbound, or pick another number.`;
          }
        }
        const tools = [input.transfer && "call transfer", input.booking && `booking (${input.booking.provider})`, input.webhooks?.length && "webhook"].filter(Boolean).join(", ") || "none";
        return respond(
          `**Assistant created**: ${input.name}${id ? ` — id \`${id}\`` : ""}\n- **type**: ${input.type}\n- **agent**: ${input.agent_name}\n- **voice**: ${voice.name} (${voice.labels?.language_name ?? input.languages[0]}, ${voice.labels?.gender ?? input.gender})\n- **languages**: ${input.languages.join(", ")}\n- **max call**: ${input.maximum_time_per_call} min\n- **tools**: ${tools}\n- **image**: default (${DEFAULT_ASSISTANT_IMAGE})${inbound}`,
          { ...res, id }
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
