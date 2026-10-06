/**
 * CRM tools: search contacts across all lists, contact details + tags, contact
 * call history, a contact's deals and custom contact fields.
 * Deal/contact updates are not exposed: those backend endpoints overwrite the
 * whole record and would blank fields an AI didn't send.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getApiClient } from "../services/qcall-api-client.js";
import { asList, errorResult, fmtFields, fmtPaging, fmtTable, respond } from "../services/response-formatter.js";
import { page, perpage, readOnly, responseFormat, uuid } from "./tool-schema-helpers.js";

const CONTACT_COLUMNS = ["contact_id", "first_name", "last_name", "phone", "email", "segment_name", "lead_status", "lifecycle_stage"];
const CONTACT_FIELDS = ["id", "first_name", "last_name", "phone", "email", "company_id", "job_title", "lifecycle_stage", "lead_status", "description", "custom_fields"];

export function registerCrmTools(server: McpServer): void {
  server.registerTool(
    "qcall_search_contacts",
    {
      title: "Search contacts",
      description: "Search contacts across all contact lists by name, email, phone, stage or custom field values.",
      inputSchema: { search: z.string().max(100).optional(), page, perpage, response_format: responseFormat },
      annotations: readOnly("Search contacts")
    },
    async ({ response_format, ...query }) => {
      try {
        const res = await getApiClient().get("/crm/contactList", query);
        return respond(`**Contacts**\n\n${fmtTable(asList(res.data), CONTACT_COLUMNS)}${fmtPaging(res, query.page)}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_get_contact",
    {
      title: "Get contact",
      description: "Get one contact's details and tags.",
      inputSchema: { contact_id: uuid("Contact id"), response_format: responseFormat },
      annotations: readOnly("Get contact")
    },
    async ({ contact_id, response_format }) => {
      try {
        const api = getApiClient();
        const [contact, tags] = await Promise.all([
          api.get("/crm/contact", { id: contact_id }),
          api.get("/tag/contact", { contact_id }).catch(() => ({ data: [] }))
        ]);
        const row = (asList(contact.data)[0] ?? contact.data ?? {}) as Record<string, unknown>;
        const tagNames = asList(tags.data).map((t) => t.name).join(", ") || "—";
        return respond(`**Contact**\n${fmtFields(row, CONTACT_FIELDS)}\n- **tags**: ${tagNames}`, { contact: contact.data, tags: tags.data }, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_get_contact_call_history",
    {
      title: "Get contact call history",
      description: "List calls made to or from a phone number (status, duration, sentiment, transcript in json format).",
      inputSchema: { phone_number: z.string().min(5).max(20).describe("Phone number, e.g. +919876543210"), response_format: responseFormat },
      annotations: readOnly("Contact call history")
    },
    async ({ phone_number, response_format }) => {
      try {
        const res = await getApiClient().get("/crm/contact-call-history", { phone_number });
        const rows = asList(res.data);
        const columns = rows[0] ? ["call_sid", "callsid", "call_status", "call_duration_in_sec", "call_sentiment", "created_at"].filter((c) => c in rows[0]) : [];
        return respond(`**Calls with ${phone_number}** (${rows.length})\n\n${fmtTable(rows, columns)}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_list_deals",
    {
      title: "List a contact's deals",
      description: "List a contact's CRM deals (name, amount, stage, close date).",
      inputSchema: { contact_id: uuid("Contact id from qcall_search_contacts"), response_format: responseFormat },
      annotations: readOnly("List deals")
    },
    async ({ contact_id, response_format }) => {
      try {
        const res = await getApiClient().get("/crm/dealsList", { cid: contact_id });
        return respond(`**Deals**\n\n${fmtTable(asList(res.data), ["id", "deal_name", "amount", "stage", "close_date"])}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_list_custom_fields",
    {
      title: "List custom contact fields",
      description: "List the workspace's custom contact fields. Use `field_key` as keys in qcall_add_contact custom_fields.",
      inputSchema: { response_format: responseFormat },
      annotations: readOnly("Custom fields")
    },
    async ({ response_format }) => {
      try {
        const res = await getApiClient().get("/contact-custom-field/list");
        return respond(`**Custom fields**\n\n${fmtTable(asList(res.data), ["field_key", "label", "field_type"])}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
