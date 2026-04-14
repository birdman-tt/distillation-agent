import { inferenceLevelSchema, refusalReasonSchema } from "@hall-of-fame/domain";
import { z } from "zod";

export const promptEvidenceItemSchema = z.object({
  sourceId: z.string().uuid(),
  title: z.string().nullable(),
  snippet: z.string(),
});

export const chatClassificationSchema = z.object({
  category: z.enum(["HIGH_RISK", "FACT_SPECIFIC", "THEME_ANCHORED", "OPEN_ENDED"]),
  matchedKeyword: z.string().nullable(),
  shouldEscalateToModelJudge: z.boolean(),
});

export const chatGenerationSchema = z.object({
  answer: z.string(),
  basis: z.array(
    z.object({
      sourceId: z.string().uuid(),
      snippet: z.string(),
    }),
  ),
  basisSummary: z.object({
    mode: z.enum(["SUPPORTED", "INFERRED", "UNSUPPORTED"]),
    summary: z.string(),
  }),
  inferenceLevel: inferenceLevelSchema,
  conflictDetected: z.boolean(),
  refusalReason: refusalReasonSchema,
});
