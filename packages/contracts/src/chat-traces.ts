import { z } from "zod";

const traceJsonSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(traceJsonSchema), z.record(z.string(), traceJsonSchema)]),
);

export const chatTraceStatusSchema = z.enum(["running", "success", "fallback_success", "failed"]);
export const chatTraceCaptureLevelSchema = z.enum(["full", "metadata-only"]);

export const chatTraceSummarySchema = z.object({
  turnTraceId: z.string().min(1),
  requestId: z.string().min(1),
  chatId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  personaId: z.string().uuid().nullable(),
  personaVersionId: z.string().uuid(),
  messageId: z.string().uuid().nullable(),
  assistantMessageId: z.string().uuid().nullable(),
  captureLevel: chatTraceCaptureLevelSchema,
  status: chatTraceStatusSchema,
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  totalDurationMs: z.number().int().nonnegative().nullable(),
  traceSchemaVersion: z.string().min(1),
  chatWorkflowVersion: z.string().min(1),
  memorySearchVersion: z.string().min(1),
  promptTemplateVersion: z.string().min(1),
  normalizationVersion: z.string().min(1),
  modelProvider: z.string().nullable(),
  modelName: z.string().nullable(),
  temperature: z.number().nullable(),
  maxTokens: z.number().int().nullable(),
  fallbackUsed: z.boolean(),
  errorMessage: z.string().nullable(),
  eventCount: z.number().int().nonnegative(),
});

export const chatTraceArtifactRefSchema = z.object({
  artifactKey: z.string().min(1),
});

export const chatTraceEventSchema = z.object({
  seq: z.number().int().positive(),
  eventName: z.string().min(1),
  stage: z.string().min(1),
  status: z.string().min(1),
  level: z.enum(["info", "warn", "error"]),
  at: z.string(),
  durationMs: z.number().int().nonnegative().nullable(),
  fields: z.record(z.string(), traceJsonSchema),
  artifactRefs: z.array(chatTraceArtifactRefSchema),
});

export const chatTraceArtifactSchema = z.object({
  artifactKey: z.string().min(1),
  contentType: z.string().min(1),
  storageKind: z.literal("inline"),
  textValue: z.string().nullable(),
  jsonValue: traceJsonSchema.nullable(),
  createdAt: z.string(),
});

export const chatTraceDetailResponseSchema = z.object({
  trace: chatTraceSummarySchema,
  events: z.array(chatTraceEventSchema),
  artifacts: z.array(chatTraceArtifactSchema),
});

export const chatTraceListResponseSchema = z.object({
  items: z.array(chatTraceSummarySchema),
});
