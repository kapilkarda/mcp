/**
 * Reusable zod fields and tool annotations shared by every tool group.
 */

import { z } from "zod";
import { DEFAULT_PERPAGE, MAX_PERPAGE } from "../constants.js";
import { ResponseFormat } from "../types/index.js";

export const responseFormat = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("'markdown' (readable summary, default) or 'json' (raw API response)");

export const page = z.number().int().min(0).default(0).describe("0-based page number");
export const perpage = z.number().int().min(1).max(MAX_PERPAGE).default(DEFAULT_PERPAGE).describe("Items per page (max 100)");

export const uuid = (what: string) => z.string().uuid().describe(what);

/** Spending or real-world side effects must be explicitly confirmed by the user. */
export const confirm = (action: string) =>
  z
    .literal(true)
    .describe(`Must be true. Only set it after the user explicitly approved ${action}.`);

export const readOnly = (title: string) => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
});

export const write = (title: string, opts: { destructive?: boolean; idempotent?: boolean } = {}) => ({
  title,
  readOnlyHint: false,
  destructiveHint: opts.destructive ?? false,
  idempotentHint: opts.idempotent ?? false,
  openWorldHint: true
});
