/**
 * Contact tools: contact lists ("segments") and the contacts inside them.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { E164_REGEX } from "../constants.js";
import { getApiClient } from "../services/qcall-api-client.js";
import { asList, errorResult, fmtPaging, fmtTable, respond } from "../services/response-formatter.js";
import { page, perpage, readOnly, responseFormat, uuid, write } from "./tool-schema-helpers.js";

const search = z.string().max(100).optional().describe("Search text");

export function registerContactTools(server: McpServer): void {
  server.registerTool(
    "qcall_list_contact_lists",
    {
      title: "List contact lists",
      description: "List contact lists (segments). Use `id` as `list_id` for contacts and as `segment_id` for campaigns.",
      inputSchema: { search, page, perpage, response_format: responseFormat },
      annotations: readOnly("Contact lists")
    },
    async ({ response_format, ...query }) => {
      try {
        const res = await getApiClient().get("/segment/list", query);
        const rows = asList(res.data);
        const columns = rows[0] ? ["id", "name", "description", "contact_count", "total_contacts", "created_at"].filter((c) => c in rows[0]) : [];
        return respond(`**Contact lists**\n\n${fmtTable(rows, columns)}${fmtPaging(res, query.page)}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_create_contact_list",
    {
      title: "Create contact list",
      description: "Create a new contact list (segment).",
      inputSchema: {
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        is_duplicate_allowed: z.boolean().default(false).describe("Allow the same phone number twice in this list")
      },
      annotations: write("Create contact list")
    },
    async (body) => {
      try {
        const api = getApiClient();
        const res = await api.post("/segment/create", body);
        // The create response carries no id; find the new list by exact name.
        const found = asList((await api.get("/segment/list", { search: body.name, perpage: 20 })).data).find((l) => l.name === body.name);
        return respond(`**Contact list created**: ${body.name}${found?.id ? ` — id \`${found.id}\`` : ""}`, { ...res, list: found });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_list_contacts",
    {
      title: "List contacts",
      description: "List contacts in a contact list.",
      inputSchema: { list_id: uuid("Contact list id"), search, page, perpage, response_format: responseFormat },
      annotations: readOnly("Contacts")
    },
    async ({ list_id, response_format, ...query }) => {
      try {
        const res = await getApiClient().get("/segment/contact/list", { id: list_id, ...query });
        const rows = asList(res.data);
        const columns = rows[0] ? ["id", "first_name", "last_name", "phone", "email", "lead_status", "created_at"].filter((c) => c in rows[0]) : [];
        return respond(`**Contacts**\n\n${fmtTable(rows, columns)}${fmtPaging(res, query.page)}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_add_contact",
    {
      title: "Add contact",
      description: "Add a contact to a contact list. `custom_fields` keys must match the workspace's custom contact fields.",
      inputSchema: {
        list_id: uuid("Contact list id"),
        phone: z.string().regex(E164_REGEX, "Use E.164 format, e.g. +919876543210"),
        first_name: z.string().min(1).max(100),
        last_name: z.string().max(100).optional(),
        email: z.string().email().optional(),
        job_title: z.string().max(200).optional(),
        description: z.string().max(1000).optional().describe("Notes the assistant can use on calls"),
        custom_fields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
      },
      annotations: write("Add contact")
    },
    async ({ list_id, ...contact }) => {
      try {
        const res = await getApiClient().post("/segment/contact/create", contact, { id: list_id });
        return respond(`**Contact added** to list ${list_id}: ${contact.first_name} ${contact.last_name ?? ""} (${contact.phone}). ${res.message ?? ""}`, res);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
