import { personaProfileSchema } from "@hall-of-fame/domain";
import { z } from "zod";

import {
  distillEntityTypeSchema,
  distillEvidenceBucketSchema,
  distillQualityScoresSchema,
  distillRiskDecisionSchema,
} from "./persona-distill.js";

export const distillRuntimeStateSchema = z.enum([
  "START",
  "RISK_CHECKED",
  "SOURCES_COLLECTED",
  "SOURCES_CLEANED",
  "EVIDENCE_EXTRACTED",
  "COVERAGE_SCORED",
  "PROFILE_GENERATED",
  "PROFILE_VALIDATED",
  "PERSISTED",
  "NEEDS_SOURCES",
  "FAILED",
]);

export const distillTerminalRuntimeStates = ["PERSISTED", "NEEDS_SOURCES", "FAILED"] as const;

export const distillToolNameSchema = z.enum([
  "check_distill_intent_risk",
  "search_sources",
  "clean_sources",
  "extract_evidence",
  "score_source_coverage",
  "generate_persona_profile",
  "validate_persona_profile",
  "persist_persona_candidate",
  "mark_job_needs_sources",
  "mark_job_failed",
]);

export const distillToolCallSchema = z.discriminatedUnion("toolName", [
  z.object({
    toolName: z.literal("check_distill_intent_risk"),
    input: z.object({
      intentId: z.string().uuid(),
      normalizedName: z.string().min(1),
      entityType: distillEntityTypeSchema,
      riskDecision: distillRiskDecisionSchema,
      riskReasons: z.array(z.string()).default([]),
    }),
  }),
  z.object({
    toolName: z.literal("search_sources"),
    input: z.object({
      discoveryId: z.string().uuid(),
      selectedSourceCandidateIds: z.array(z.string().uuid()).default([]),
      selectedExtraSourceIds: z.array(z.string().uuid()).default([]),
    }),
  }),
  z.object({
    toolName: z.literal("clean_sources"),
    input: z.object({
      maxCharsPerSource: z.number().int().min(200).max(5000).default(1200),
      dropLowTrustSources: z.boolean().default(false),
    }),
  }),
  z.object({
    toolName: z.literal("extract_evidence"),
    input: z.object({
      buckets: z.array(distillEvidenceBucketSchema).default([]),
      maxEvidencePerBucket: z.number().int().min(1).max(12).default(4),
    }),
  }),
  z.object({
    toolName: z.literal("score_source_coverage"),
    input: z.object({
      minimumSources: z.number().int().min(1).max(10).default(3),
      minimumBuckets: z.number().int().min(1).max(6).default(2),
    }),
  }),
  z.object({
    toolName: z.literal("generate_persona_profile"),
    input: z.object({
      displayName: z.string().min(1),
      distillFocus: z.array(z.string().min(1)).min(1).max(8),
    }),
  }),
  z.object({
    toolName: z.literal("validate_persona_profile"),
    input: z.object({
      strictness: z.enum(["preview", "publish"]).default("preview"),
    }),
  }),
  z.object({
    toolName: z.literal("persist_persona_candidate"),
    input: z.object({
      idempotencyKey: z.string().min(1),
    }),
  }),
  z.object({
    toolName: z.literal("mark_job_needs_sources"),
    input: z.object({
      missingRequirements: z.array(z.string().min(1)).min(1),
      userMessage: z.string().min(1).max(160),
    }),
  }),
  z.object({
    toolName: z.literal("mark_job_failed"),
    input: z.object({
      code: z.string().min(1),
      message: z.string().min(1).max(500),
      retryable: z.boolean().default(true),
    }),
  }),
]);

export const distillPreviewDraftSchema = z.object({
  previewIntro: z.string(),
  recommendedQuestions: z.array(z.string()).length(3),
  sampleAnswers: z.array(z.string()).min(2).max(3),
});

export const distillGeneratedProfileDraftSchema = z.object({
  profile: personaProfileSchema,
  preview: distillPreviewDraftSchema,
  scores: distillQualityScoresSchema,
});

export const distillToolResultSchema = z.object({
  ok: z.boolean(),
  stateAfter: distillRuntimeStateSchema,
  summary: z.string().max(1000),
  data: z.record(z.string(), z.unknown()).default({}),
});

export type DistillRuntimeState = z.infer<typeof distillRuntimeStateSchema>;
export type DistillToolName = z.infer<typeof distillToolNameSchema>;
export type DistillToolCall = z.infer<typeof distillToolCallSchema>;
export type DistillToolResult = z.infer<typeof distillToolResultSchema>;
