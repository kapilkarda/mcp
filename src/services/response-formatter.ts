/**
 * Shared helpers that turn QCall API data into MCP tool results.
 * Tools return compact Markdown by default, or raw JSON on request.
 */

import { CHARACTER_LIMIT } from "../constants.js";
import { ApiError, AuthenticationError, RateLimitError, ResponseFormat } from "../types/index.js";

export type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export function truncateIfNeeded(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  const note = "\n\n---\n**Response truncated due to size.** Use pagination or filters to narrow the results.";
  return text.slice(0, CHARACTER_LIMIT - note.length - 3) + "..." + note;
}

/**
 * JSON that always parses: oversized list payloads drop trailing rows (halving)
 * and say so, instead of being cut mid-string like Markdown.
 */
function fitJson(json: unknown): string {
  let text = JSON.stringify(json, null, 2);
  if (text.length <= CHARACTER_LIMIT) return text;
  const envelope = json as { data?: unknown } | undefined;
  let rows = Array.isArray(json) ? json : Array.isArray(envelope?.data) ? (envelope!.data as unknown[]) : undefined;
  if (!rows) return JSON.stringify({ truncated: true, note: "Response too large; use filters or markdown format." });
  // First shorten long text values (transcripts, scripts), then drop trailing rows.
  rows = rows.map((row) =>
    row && typeof row === "object"
      ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "string" && v.length > 500 ? `${v.slice(0, 500)}…[truncated]` : v]))
      : row
  );
  text = JSON.stringify(Array.isArray(json) ? rows : { ...envelope, data: rows }, null, 2);
  const total = rows.length;
  while (rows.length > 1 && text.length > CHARACTER_LIMIT) {
    rows = rows.slice(0, Math.ceil(rows.length / 2));
    const note = `Showing ${rows.length} of ${total} rows (response too large). Use pagination or filters.`;
    text = JSON.stringify(Array.isArray(json) ? { data: rows, truncated: true, note } : { ...envelope, data: rows, truncated: true, note }, null, 2);
  }
  return text.length <= CHARACTER_LIMIT ? text : JSON.stringify({ truncated: true, note: "Response too large; fetch a single item instead." });
}

/** Markdown for humans, JSON for programmatic use. */
export function respond(markdown: string, json: unknown, format: ResponseFormat = ResponseFormat.MARKDOWN): ToolResult {
  const text = format === ResponseFormat.JSON ? fitJson(json) : truncateIfNeeded(markdown);
  return { content: [{ type: "text", text }] };
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function errorResult(error: unknown): ToolResult {
  let text: string;
  if (error instanceof AuthenticationError) {
    text = `**Error**: ${error.message}\n\nThe QCall API key is invalid or was revoked. Create a new one in QCall → Integrations → AI Assistants (MCP), or reconnect.`;
  } else if (error instanceof RateLimitError) {
    text = `**Error**: ${error.message}${error.retryAfter ? ` Retry after ${error.retryAfter}s.` : ""}`;
  } else if (error instanceof ApiError) {
    text = `**Error** (${error.statusCode}): ${error.message}`;
  } else {
    text = `**Error**: ${(error as Error)?.message || "Unknown error"}`;
  }
  return { content: [{ type: "text", text }], isError: true };
}

const isBlank = (value: unknown) => value === null || value === undefined || value === "";

function cell(value: unknown): string {
  if (isBlank(value)) return "—";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 120);
}

/** `- **label**: value` lines for the given keys (skips empty values). */
export function fmtFields(obj: Record<string, unknown> | undefined, keys: string[]): string {
  if (!obj) return "";
  return keys
    .filter((key) => !isBlank(obj[key]))
    .map((key) => `- **${key}**: ${cell(obj[key])}`)
    .join("\n");
}

/** Markdown table of the given columns. */
export function fmtTable(rows: Array<Record<string, unknown>>, columns: string[]): string {
  if (!rows.length) return "_No results._";
  const header = `| ${columns.join(" | ")} |\n|${columns.map(() => "---").join("|")}|`;
  const body = rows.map((row) => `| ${columns.map((col) => cell(row[col])).join(" | ")} |`).join("\n");
  return `${header}\n${body}`;
}

/** Pagination footer from QCall's { totalItems, totalPages } envelope fields. */
export function fmtPaging(envelope: { totalItems?: unknown; totalPages?: unknown }, page: number): string {
  if (envelope.totalItems === undefined && envelope.totalPages === undefined) return "";
  return `\n\n_page ${page} (0-based) · ${envelope.totalPages ?? "?"} pages · ${envelope.totalItems ?? "?"} total_`;
}

/** Extracts an array from QCall payloads that wrap lists differently per endpoint. */
export function asList(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === "object") {
    for (const key of ["data", "rows", "list", "items", "result"]) {
      const inner = (data as Record<string, unknown>)[key];
      if (Array.isArray(inner)) return inner as Array<Record<string, unknown>>;
    }
  }
  return [];
}
