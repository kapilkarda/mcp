/**
 * Builds a fully-registered QCall McpServer.
 * Shared by the stdio entry (index.ts) and the hosted HTTP entry (http-server.ts).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_TITLE, SERVER_VERSION } from "./constants.js";
import { registerAccountTools } from "./tools/account.js";
import { registerAssistantTools } from "./tools/assistants.js";
import { registerAssistantCreateTool } from "./tools/assistant-create.js";
import { registerCallTools } from "./tools/calls.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerCampaignTools } from "./tools/campaigns.js";
import { registerKnowledgeAndAnalyticsTools } from "./tools/knowledge-and-analytics.js";
import { registerTagTools } from "./tools/tags.js";
import { registerCrmTools } from "./tools/crm.js";
import { registerActivityTools } from "./tools/activity-and-callbacks.js";

export function createQcallMcpServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, title: SERVER_TITLE, version: SERVER_VERSION });

  registerAccountTools(server);
  registerAssistantTools(server);
  registerAssistantCreateTool(server);
  registerCallTools(server);
  registerContactTools(server);
  registerCampaignTools(server);
  registerKnowledgeAndAnalyticsTools(server);
  registerTagTools(server);
  registerCrmTools(server);
  registerActivityTools(server);

  return server;
}
