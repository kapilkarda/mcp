import { test } from "node:test";
import assert from "node:assert";
import {
  respond,
  truncateIfNeeded,
  errorResult,
  fmtTable,
  fmtFields,
  fmtPaging,
  asList,
  textResult
} from "../src/services/response-formatter.js";
import { ResponseFormat, ApiError, AuthenticationError, RateLimitError } from "../src/types/index.js";

test("respond - JSON mode with large payload includes truncated flag", () => {
  const largeArray = Array.from({ length: 500 }, (_, i) => ({
    id: i,
    text: "a".repeat(500)
  }));

  const result = respond("markdown", largeArray, ResponseFormat.JSON);
  const text = result.content[0].text;
  const parsed = JSON.parse(text);

  assert(parsed.truncated === true);
  assert(typeof parsed.note === "string");
});

test("respond - markdown mode truncates with note", () => {
  const longText = "a".repeat(26000); // Longer than CHARACTER_LIMIT (25000)
  const result = respond(longText, {}, ResponseFormat.MARKDOWN);
  const text = result.content[0].text;

  assert(text.length < longText.length);
  assert(text.includes("truncated"));
  assert(text.includes("---"));
});

test("respond - returns markdown by default", () => {
  const result = respond("# Hello", { data: "json" });
  const text = result.content[0].text;
  assert.strictEqual(text, "# Hello");
});

test("truncateIfNeeded - preserves short text", () => {
  const short = "Hello world";
  const truncated = truncateIfNeeded(short);
  assert.strictEqual(truncated, short);
});

test("truncateIfNeeded - truncates long text with note", () => {
  const long = "a".repeat(50000);
  const truncated = truncateIfNeeded(long);

  assert(truncated.length < long.length);
  assert(truncated.includes("truncated"));
  assert(truncated.includes("---"));
});

test("errorResult - AuthenticationError includes reconnect message", () => {
  const error = new AuthenticationError("Invalid key");
  const result = errorResult(error);
  const text = result.content[0].text;

  assert(result.isError === true);
  assert(text.includes("Invalid key"));
  assert(text.includes("Integrations"));
});

test("errorResult - RateLimitError includes retry message", () => {
  const error = new RateLimitError(60);
  const result = errorResult(error);
  const text = result.content[0].text;

  assert(result.isError === true);
  assert(text.includes("Retry after 60s"));
});

test("errorResult - ApiError includes status code", () => {
  const error = new ApiError(500, "Server error");
  const result = errorResult(error);
  const text = result.content[0].text;

  assert(result.isError === true);
  assert(text.includes("500"));
  assert(text.includes("Server error"));
});

test("errorResult - generic Error handled", () => {
  const error = new Error("Something failed");
  const result = errorResult(error);

  assert(result.isError === true);
  assert(result.content[0].text.includes("Something failed"));
});

test("fmtTable - basic table formatting", () => {
  const rows = [
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 }
  ];
  const table = fmtTable(rows, ["name", "age"]);

  assert(table.includes("| name | age |"));
  assert(table.includes("| Alice | 30 |"));
  assert(table.includes("| Bob | 25 |"));
});

test("fmtTable - escapes pipe characters", () => {
  const rows = [{ text: "a|b" }];
  const table = fmtTable(rows, ["text"]);

  assert(table.includes("a\\|b"));
});

test("fmtTable - empty array returns no results message", () => {
  const table = fmtTable([], ["name"]);
  assert.strictEqual(table, "_No results._");
});

test("fmtFields - formats key-value pairs", () => {
  const obj = { name: "Test", value: 42, empty: "" };
  const fields = fmtFields(obj, ["name", "value", "empty"]);

  assert(fields.includes("- **name**: Test"));
  assert(fields.includes("- **value**: 42"));
  assert(!fields.includes("empty"));
});

test("fmtFields - handles undefined object", () => {
  const fields = fmtFields(undefined, ["name"]);
  assert.strictEqual(fields, "");
});

test("fmtPaging - shows pagination info", () => {
  const envelope = { totalItems: 150, totalPages: 3 };
  const paging = fmtPaging(envelope, 1);

  assert(paging.includes("page 1"));
  assert(paging.includes("3 pages"));
  assert(paging.includes("150 total"));
});

test("fmtPaging - handles missing fields", () => {
  const paging = fmtPaging({}, 0);
  assert.strictEqual(paging, "");
});

test("asList - extracts array directly", () => {
  const data = [{ id: 1 }, { id: 2 }];
  const list = asList(data);
  assert.deepStrictEqual(list, data);
});

test("asList - extracts from data field", () => {
  const data = { data: [{ id: 1 }, { id: 2 }] };
  const list = asList(data);
  assert.deepStrictEqual(list, [{ id: 1 }, { id: 2 }]);
});

test("asList - extracts from rows field", () => {
  const data = { rows: [{ id: 1 }] };
  const list = asList(data);
  assert.deepStrictEqual(list, [{ id: 1 }]);
});

test("asList - extracts from items field", () => {
  const data = { items: [{ id: 1 }] };
  const list = asList(data);
  assert.deepStrictEqual(list, [{ id: 1 }]);
});

test("asList - returns empty array for non-array data", () => {
  const list = asList({ scalar: "value" });
  assert.deepStrictEqual(list, []);
});

test("textResult - wraps text in content", () => {
  const result = textResult("Hello world");
  assert.deepStrictEqual(result.content[0].text, "Hello world");
  assert(result.isError === undefined);
});

test("fmtTable - long string values truncated at 120 chars", () => {
  const rows = [{ text: "a".repeat(200) }];
  const table = fmtTable(rows, ["text"]);

  assert(table.includes("a".repeat(120)));
  assert(!table.includes("a".repeat(121)));
});

test("fmtFields - handles objects in values", () => {
  const obj = { data: { nested: true }, count: 5 };
  const fields = fmtFields(obj, ["data", "count"]);

  assert(fields.includes("**data**"));
  assert(fields.includes("**count**: 5"));
});
