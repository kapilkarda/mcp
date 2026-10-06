/**
 * Tag tools: list and create tags, tag and untag contacts. No delete tool.
 * Backend: /tag/* (parameterized, workspace-scoped).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getApiClient } from "../services/qcall-api-client.js";
import { asList, errorResult, fmtPaging, fmtTable, respond } from "../services/response-formatter.js";
import { page, readOnly, responseFormat, uuid, write } from "./tool-schema-helpers.js";

const tagIds = z.array(z.string().uuid()).min(1).max(50).describe("Tag ids from qcall_list_tags");

export function registerTagTools(server: McpServer): void {
  server.registerTool(
    "qcall_list_tags",
    {
      title: "List tags",
      description: "List the workspace's contact tags with how many contacts carry each. In QCall, tags and contact lists are the same records, so lists appear here too. Use `id` as a tag id in other tag tools.",
      inputSchema: {
        search: z.string().max(100).optional(),
        page,
        perpage: z.number().int().min(1).max(100).default(50),
        response_format: responseFormat
      },
      annotations: readOnly("List tags")
    },
    async ({ response_format, ...query }) => {
      try {
        const res = await getApiClient().get("/tag/list", query);
        const rows = asList(res.data);
        return respond(`**Tags**\n\n${fmtTable(rows, ["id", "name", "color", "contact_count", "description"])}${fmtPaging(res, query.page)}`, res, response_format);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_create_tag",
    {
      title: "Create tag",
      description: "Create a contact tag (e.g. 'Hot lead', 'Callback requested'). It also appears as a contact list in QCall. Fails if a tag with the same name exists.",
      inputSchema: {
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Hex colour like #6366f1").optional()
      },
      annotations: write("Create tag")
    },
    async (body) => {
      try {
        const res = await getApiClient().post("/tag/create", body);
        const tag = (res.data ?? {}) as Record<string, unknown>;
        return respond(`**Tag created**: ${body.name}${tag.id ? ` — id \`${tag.id}\`` : ""}`, res);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_tag_contacts",
    {
      title: "Tag contacts",
      description: "Add one or more tags to one or more contacts. Contact ids come from qcall_search_contacts or qcall_list_contacts.",
      inputSchema: {
        contact_ids: z.array(z.string().uuid()).min(1).max(500).describe("Contact ids"),
        tag_ids: tagIds
      },
      annotations: write("Tag contacts", { idempotent: true })
    },
    async (body) => {
      try {
        const res = await getApiClient().post("/tag/bulk-assign", body);
        return respond(`**Tagged** ${body.contact_ids.length} contact(s) with ${body.tag_ids.length} tag(s). ${res.message ?? ""}`, res);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "qcall_untag_contact",
    {
      title: "Remove tags from a contact",
      description: "Remove tags from a contact. The tags themselves are kept.",
      inputSchema: { contact_id: uuid("Contact id"), tag_ids: tagIds },
      annotations: write("Untag contact", { idempotent: true })
    },
    async (body) => {
      try {
        const res = await getApiClient().post("/tag/remove", body);
        const removed = (res.data as Record<string, unknown> | undefined)?.removed_count;
        return respond(`**Removed** ${removed ?? body.tag_ids.length} tag(s) from the contact.`, res);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
