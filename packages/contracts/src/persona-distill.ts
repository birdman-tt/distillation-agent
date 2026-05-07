import { z } from "zod";

export const distillEvidenceBucketSchema = z.enum([
  "WRITINGS",
  "CONVERSATIONS",
  "EXPRESSION_DNA",
  "EXTERNAL_VIEWS",
  "DECISIONS",
  "TIMELINE",
]);

export const distillSourceCategorySchema = z.enum([
  "official_primary",
  "official_secondary",
  "canon",
  "adaptation",
  "fandom_summary",
  "analysis",
  "media_report",
  "unknown",
]);

export const distillEntityTypeSchema = z.enum(["REAL_PERSON", "FICTIONAL_CHARACTER", "UNKNOWN"]);
export const distillRiskDecisionSchema = z.enum(["ALLOW", "NEED_REVIEW", "BLOCK"]);

export const createDistillIntentRequestSchema = z.object({
  query: z.string().min(1).max(120),
  usageIntent: z.enum(["chat_companion", "decision_lens", "learning", "roleplay"]).default("chat_companion"),
  focus: z.array(z.string().min(1).max(30)).max(6).default([]),
});

export const distillIntentResponseSchema = z.object({
  intentId: z.string().uuid(),
  normalizedName: z.string(),
  entityType: distillEntityTypeSchema,
  riskDecision: distillRiskDecisionSchema,
  riskReasons: z.array(z.string()),
  coverageHint: z.enum(["ENOUGH", "LOW", "NONE"]),
  nextStep: z.enum(["DISCOVER_SOURCES", "NEED_REVIEW", "BLOCKED"]),
});

export const createDistillSourceDiscoveryRequestSchema = z.object({
  intentId: z.string().uuid(),
  preferredLanguage: z.string().min(2).max(20).default("zh-CN"),
  maxSourcesPerBucket: z.number().int().min(1).max(8).default(4),
});

export const distillSourceCandidateSchema = z.object({
  sourceCandidateId: z.string().uuid(),
  bucket: distillEvidenceBucketSchema,
  title: z.string(),
  url: z.string().url().nullable(),
  normalizedUrlHash: z.string().nullable(),
  publisher: z.string().nullable(),
  author: z.string().nullable(),
  publishedAt: z.string().nullable(),
  snippet: z.string(),
  sourceKind: z.enum(["PRIMARY", "SECONDARY", "SUMMARY"]),
  trustLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
  sourceCategory: distillSourceCategorySchema,
  isPrimary: z.boolean(),
  recommended: z.boolean(),
  recommendationReason: z.string(),
  dedupeKey: z.string(),
  riskFlags: z.array(z.string()),
});

export const distillExtraSourceCandidateSchema = distillSourceCandidateSchema.extend({
  extraSourceId: z.string().uuid(),
  status: z.enum(["PENDING", "USABLE", "REJECTED"]),
  rejectionReason: z.string().nullable(),
});

export const distillSourceDiscoveryResponseSchema = z.object({
  discoveryId: z.string().uuid(),
  normalizedName: z.string(),
  entityType: distillEntityTypeSchema,
  riskDecision: distillRiskDecisionSchema,
  bucketCoverage: z.record(distillEvidenceBucketSchema, z.number().int().nonnegative()),
  sourceCandidates: z.array(distillSourceCandidateSchema),
  missingBuckets: z.array(distillEvidenceBucketSchema),
  qualityWarnings: z.array(z.string()),
  sanitizerVersion: z.string(),
});

export const sourceDiscoveryJobStatusSchema = z.enum([
  "QUEUED",
  "CLAIMED",
  "SEARCHING",
  "PERSISTING",
  "SUCCEEDED",
  "FAILED",
  "BLOCKED",
]);

export const sourceDiscoveryJobNextActionSchema = z.enum([
  "POLL_SOURCE_DISCOVERY",
  "CONFIRM_SOURCES",
  "RETRY_SOURCE_DISCOVERY",
  "SOURCE_DISCOVERY_BLOCKED",
]);

export const sourceDiscoveryJobErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

const sourceDiscoveryJobBaseResponseSchema = z.object({
  sourceDiscoveryJobId: z.string().uuid(),
  intentId: z.string().uuid(),
  currentStep: z.string(),
  progress: z.number().int().min(0).max(100),
  pollHref: z.string().optional(),
});

const inProgressSourceDiscoveryJobResponseSchema = sourceDiscoveryJobBaseResponseSchema.extend({
  status: z.enum(["QUEUED", "CLAIMED", "SEARCHING", "PERSISTING"]),
  discoveryId: z.null(),
  discovery: z.null(),
  error: z.null(),
  nextAction: z.literal("POLL_SOURCE_DISCOVERY"),
});

const succeededSourceDiscoveryJobResponseSchema = sourceDiscoveryJobBaseResponseSchema.extend({
  status: z.literal("SUCCEEDED"),
  discoveryId: z.string().uuid(),
  discovery: distillSourceDiscoveryResponseSchema,
  error: z.null(),
  nextAction: z.literal("CONFIRM_SOURCES"),
});

const failedSourceDiscoveryJobResponseSchema = sourceDiscoveryJobBaseResponseSchema.extend({
  status: z.literal("FAILED"),
  discoveryId: z.null(),
  discovery: z.null(),
  error: sourceDiscoveryJobErrorSchema.extend({
    retryable: z.literal(true),
  }),
  nextAction: z.literal("RETRY_SOURCE_DISCOVERY"),
});

const blockedSourceDiscoveryJobResponseSchema = sourceDiscoveryJobBaseResponseSchema.extend({
  status: z.literal("BLOCKED"),
  discoveryId: z.null(),
  discovery: z.null(),
  error: sourceDiscoveryJobErrorSchema.extend({
    retryable: z.literal(false),
  }),
  nextAction: z.literal("SOURCE_DISCOVERY_BLOCKED"),
});

export const distillSourceDiscoveryJobResponseSchema = z.union([
  inProgressSourceDiscoveryJobResponseSchema,
  succeededSourceDiscoveryJobResponseSchema,
  failedSourceDiscoveryJobResponseSchema,
  blockedSourceDiscoveryJobResponseSchema,
]);

const queuedSourceDiscoveryJobResponseSchema = inProgressSourceDiscoveryJobResponseSchema.extend({
  status: z.literal("QUEUED"),
  discoveryId: z.null(),
  discovery: z.null(),
  error: z.null(),
  nextAction: z.literal("POLL_SOURCE_DISCOVERY"),
  pollHref: z.string().min(1),
});

export const createDistillSourceDiscoveryJobResponseSchema = queuedSourceDiscoveryJobResponseSchema;
export const retryDistillSourceDiscoveryJobResponseSchema = queuedSourceDiscoveryJobResponseSchema;

export const addDistillExtraSourcesRequestSchema = z.object({
  extraTextSources: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        content: z.string().min(1).max(20_000),
        sourceKind: z.enum(["PRIMARY", "SECONDARY", "SUMMARY"]).default("PRIMARY"),
      }),
    )
    .default([]),
  extraUrlSources: z
    .array(
      z.object({
        url: z.string().url(),
        title: z.string().max(120).optional(),
        sourceKind: z.enum(["PRIMARY", "SECONDARY", "SUMMARY"]).default("SECONDARY"),
      }),
    )
    .default([]),
});

export const addDistillExtraSourcesResponseSchema = distillSourceDiscoveryResponseSchema.extend({
  pendingExtraSources: z.array(distillExtraSourceCandidateSchema),
});

export const createDistillJobRequestSchema = z.object({
  intentId: z.string().uuid(),
  discoveryId: z.string().uuid(),
  selectedSourceCandidateIds: z.array(z.string().uuid()).default([]),
  selectedExtraSourceIds: z.array(z.string().uuid()).default([]),
});

export const distillJobStatusSchema = z.enum([
  "QUEUED",
  "CLAIMED",
  "INGESTING",
  "EXTRACTING",
  "SYNTHESIZING",
  "VALIDATING",
  "PERSISTING",
  "SUCCEEDED",
  "NEEDS_MORE_SOURCES",
  "FAILED",
  "BLOCKED",
  "SUPERSEDED",
]);

export const distillQualityScoresSchema = z.object({
  coverageScore: z.number().int().min(0).max(100),
  groundingScore: z.number().int().min(0).max(100),
  styleScore: z.number().int().min(0).max(100),
  riskScore: z.number().int().min(0).max(100),
});

export const distillJobResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: distillJobStatusSchema,
  currentStep: z.string(),
  progress: z.number().int().min(0).max(100),
  personaId: z.string().uuid().nullable(),
  resultVersionId: z.string().uuid().nullable(),
  objectId: z.string().uuid().nullable(),
  objectHref: z.string().nullable(),
  intent: distillIntentResponseSchema,
  discovery: distillSourceDiscoveryResponseSchema,
  selectedSourceCandidateIds: z.array(z.string().uuid()),
  selectedExtraSourceIds: z.array(z.string().uuid()),
  pendingExtraSources: z.array(distillExtraSourceCandidateSchema),
  missingRequirements: z.array(z.string()),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
});

export const createDistillJobResponseSchema = distillJobResponseSchema.pick({
  jobId: true,
  status: true,
  currentStep: true,
  progress: true,
  personaId: true,
  resultVersionId: true,
  objectId: true,
  objectHref: true,
  intent: true,
  discovery: true,
  selectedSourceCandidateIds: true,
  selectedExtraSourceIds: true,
  pendingExtraSources: true,
  missingRequirements: true,
  error: true,
});

export type SourceDiscoveryJobStatus = z.infer<typeof sourceDiscoveryJobStatusSchema>;
export type SourceDiscoveryJobNextAction = z.infer<typeof sourceDiscoveryJobNextActionSchema>;
export type SourceDiscoveryJobError = z.infer<typeof sourceDiscoveryJobErrorSchema>;
export type DistillSourceDiscoveryJobResponse = z.infer<typeof distillSourceDiscoveryJobResponseSchema>;
export type CreateDistillSourceDiscoveryJobResponse = z.infer<typeof createDistillSourceDiscoveryJobResponseSchema>;
export type RetryDistillSourceDiscoveryJobResponse = z.infer<typeof retryDistillSourceDiscoveryJobResponseSchema>;
