import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeDistillToolTraceJson } from "./trace-sanitizer.js";

test("trace sanitizer redacts sensitive long source fields", () => {
  const sanitized = sanitizeDistillToolTraceJson({
    title: "资料",
    content: "x".repeat(2000),
    nested: {
      normalizedText: "secret long text",
      rawHtml: "<html>secret</html>",
    },
  }) as Record<string, unknown>;

  assert.equal(sanitized.content, "[redacted]");
  assert.deepEqual(sanitized.nested, {
    normalizedText: "[redacted]",
    rawHtml: "[redacted]",
  });
  assert.doesNotMatch(JSON.stringify(sanitized), /secret long text/);
});

test("trace sanitizer truncates long ordinary strings", () => {
  const sanitized = sanitizeDistillToolTraceJson({ snippet: "x".repeat(900) }) as Record<string, string>;
  const snippet = sanitized.snippet;

  if (typeof snippet !== "string") {
    throw new Error("expected sanitized snippet to be a string");
  }
  assert.match(snippet, /<truncated>/);
  assert.ok(snippet.length < 540);
});

test("trace sanitizer limits arrays, object keys, depth, and total size", () => {
  const manyKeys = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`key${index}`, index]));
  const sanitized = sanitizeDistillToolTraceJson({
    list: Array.from({ length: 30 }, (_, index) => index),
    manyKeys,
    deep: { a: { b: { c: { d: { e: { f: "too deep" } } } } } },
    large: Array.from({ length: 200 }, (_, index) => ({ value: "x".repeat(200), index })),
  }) as Record<string, unknown>;

  assert.ok(Array.isArray(sanitized.list));
  assert.equal((sanitized.list as unknown[]).length, 21);
  assert.equal(((sanitized.manyKeys as Record<string, unknown>).__truncatedKeys), 20);
  assert.match(JSON.stringify(sanitized.deep), /truncated:depth/);
  assert.ok(JSON.stringify(sanitized).length <= 12 * 1024 + 200);
});
