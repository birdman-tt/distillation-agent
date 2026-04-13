import { z } from "zod";

export const sourceInputTypeSchema = z.enum(["TEXT", "URL", "OFFICIAL_SEED"]);
export type SourceInputType = z.infer<typeof sourceInputTypeSchema>;

export const sourceReviewStatusSchema = z.enum([
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
]);
export type SourceReviewStatus = z.infer<typeof sourceReviewStatusSchema>;

export const sourceKindSchema = z.enum(["PRIMARY", "SECONDARY", "SUMMARY"]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const sourceDocumentSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  title: z.string().nullable(),
  author: z.string().nullable(),
  url: z.string().url().nullable(),
  normalizedText: z.string(),
  contentHash: z.string(),
});

export const evidenceSpanSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  sectionLabel: z.string().nullable(),
  spanStart: z.number().int().nonnegative(),
  spanEnd: z.number().int().nonnegative(),
  normalizedQuote: z.string(),
  sourceKind: sourceKindSchema,
  trustScore: z.number().int().min(0).max(100),
});
