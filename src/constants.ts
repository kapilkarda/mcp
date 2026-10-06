/**
 * Constants for the QCall MCP server.
 */

export const SERVER_NAME = "qcall-mcp-server";
// Display name MCP clients show for this server.
export const SERVER_TITLE = "QCall AI";
export const SERVER_VERSION = "1.0.0";

// QCall REST API (all routes live under /api/v1).
export const DEFAULT_API_BASE_URL = "https://api.qcall.ai/api/v1";
export const API_TIMEOUT = 30_000;

// Maximum tool response size (characters) before truncation.
export const CHARACTER_LIMIT = 25_000;

// MCP API keys minted in QCall (Integrations → AI Assistants). Legacy UUID keys also work.
export const MCP_KEY_PREFIX = "qc_live_";

// Pagination (QCall lists use 0-based `page` + `perpage`).
export const DEFAULT_PERPAGE = 20;
export const MAX_PERPAGE = 100;

// Calls
export const E164_REGEX = /^\+[1-9]\d{6,14}$/;
export const PLACE_CALL_MAX_NUMBERS = 5;

export const APP_URL = "https://app.qcall.ai";
