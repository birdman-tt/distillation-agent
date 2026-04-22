import { sourceKindSchema } from "@hall-of-fame/domain";
import { z } from "zod";

export const workerSourceIngestRequestSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  author: z.string().optional(),
});

export const workerSourceIngestResponseSchema = z.object({
  normalizedUrl: z.string().url(),
  normalizedUrlHash: z.string(),
  snapshot: z.object({
    title: z.string(),
    author: z.string().nullable(),
    normalizedText: z.string(),
  }),
  guardrails: z.object({
    protocol: z.string(),
    privateNetworkBlocked: z.boolean(),
    maxRedirects: z.number().int().positive(),
    maxResponseBytes: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
  }),
});

export const workerDistillRequestSchema = z.object({
  displayName: z.string().min(1),
  distillFocus: z.array(z.string()).min(1),
  approvedSources: z.array(
    z.object({
      sourceId: z.string().uuid(),
      sourceKind: sourceKindSchema,
      title: z.string().nullable(),
      summary: z.string(),
    }),
  ).min(1),
});

export const workerDistillResponseSchema = z.object({
  profile: z.record(z.string(), z.unknown()),
  preview: z.object({
    previewIntro: z.string(),
    recommendedQuestions: z.array(z.string()).length(3),
    sampleAnswers: z.array(z.string()).min(2),
  }),
  scores: z.object({
    coverageScore: z.number().int().min(0).max(100),
    groundingScore: z.number().int().min(0).max(100),
    styleScore: z.number().int().min(0).max(100),
    riskScore: z.number().int().min(0).max(100),
  }),
});
