import { sourceInputTypeSchema, sourceKindSchema, sourceReviewStatusSchema } from "@hall-of-fame/domain";
import { z } from "zod";

export const createTextSourceSchema = z.object({
  content: z.string().min(1),
  title: z.string().min(1).max(120).optional(),
  author: z.string().min(1).max(120).optional(),
  sourceKind: sourceKindSchema.default("SUMMARY"),
});

export const createUrlSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(120).optional(),
  author: z.string().min(1).max(120).optional(),
  sourceKind: sourceKindSchema.default("SUMMARY"),
});

export const sourceRecordSchema = z.object({
  id: z.string().uuid(),
  personaId: z.string().uuid(),
  inputType: sourceInputTypeSchema,
  reviewStatus: sourceReviewStatusSchema,
  sourceUrl: z.string().nullable(),
  sourceTitle: z.string().nullable(),
  sourceAuthor: z.string().nullable(),
  sourceSummary: z.string().nullable(),
  sourceKind: sourceKindSchema,
  createdAt: z.string(),
});

export const listSourcesResponseSchema = z.object({
  items: z.array(sourceRecordSchema),
});
