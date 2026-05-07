import { z } from "zod";

import { distillJobStatusSchema } from "./persona-distill.js";
import { distillRuntimeStateSchema } from "./distill-tools.js";

const sensitiveKeys = new Set([
  "apikey",
  "authorization",
  "body",
  "content",
  "fulltext",
  "html",
  "normalizedtext",
  "password",
  "rawcontent",
  "rawhtml",
  "sourcetext",
  "token",
]);

const maxStringLength = 500;
const maxArrayItems = 20;
const maxObjectKeys = 40;
const maxDepth = 5;
const maxSerializedBytes = 12 * 1024;

const truncateString = (value: string) =>
  value.length > maxStringLength ? `${value.slice(0, maxStringLength)}...<truncated>` : value;

const normalizeKey = (key: string) => key.toLowerCase().replace(/[_-]/gu, "");

const sanitizeValue = (value: unknown, depth: number): unknown => {
  if (depth > maxDepth) {
    return "[truncated:depth]";
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, maxArrayItems).map((item) => sanitizeValue(item, depth + 1));
    if (value.length > maxArrayItems) {
      items.push(`[truncated:${value.length - maxArrayItems} items]`);
    }
    return items;
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, maxObjectKeys);
    for (const [key, childValue] of entries) {
      result[key] = sensitiveKeys.has(normalizeKey(key)) ? "[redacted]" : sanitizeValue(childValue, depth + 1);
    }
    const originalKeyCount = Object.keys(value as Record<string, unknown>).length;
    if (originalKeyCount > maxObjectKeys) {
      result.__truncatedKeys = originalKeyCount - maxObjectKeys;
    }
    return result;
  }

  return String(value);
};

export const sanitizeDistillToolTraceJson = (value: unknown): unknown => {
  const sanitized = sanitizeValue(value, 0);
  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= maxSerializedBytes) {
    return sanitized;
  }

  return {
    truncated: true,
    reason: "trace_json_too_large",
    preview: truncateString(serialized),
  };
};

export const distillJobTraceRunSchema = z.object({
  seq: z.number().int().positive(),
  toolName: z.string().min(1),
  runtimeStateBefore: distillRuntimeStateSchema,
  runtimeStateAfter: distillRuntimeStateSchema.nullable(),
  status: z.enum(["RUNNING", "SUCCEEDED", "FAILED", "REJECTED"]),
  input: z.unknown(),
  output: z.unknown(),
  errorMessage: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
});

export const distillJobTraceArtifactSchema = z.object({
  stage: z.string().min(1),
  artifact: z.unknown(),
  createdAt: z.string(),
});

export const distillJobTraceEventSchema = z.object({
  kind: z.string().min(1),
  label: z.string().min(1),
  at: z.string(),
  seq: z.number().int().positive().nullable(),
  toolName: z.string().nullable(),
  status: z.string().nullable(),
  summary: z.string().nullable(),
});

export const distillJobTraceResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: distillJobStatusSchema,
  currentStep: z.string(),
  progress: z.number().int().min(0).max(100),
  events: z.array(distillJobTraceEventSchema),
  runs: z.array(distillJobTraceRunSchema),
  artifacts: z.array(distillJobTraceArtifactSchema),
});
