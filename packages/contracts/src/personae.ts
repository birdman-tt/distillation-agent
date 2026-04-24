import { personaListingStatusSchema, personaOriginTypeSchema, personaStatusSchema, personaTypeSchema } from "@hall-of-fame/domain";
import { z } from "zod";

export const createPersonaSchema = z.object({
  displayName: z.string().min(1).max(80),
  positioning: z.string().min(1).max(120),
  personaType: personaTypeSchema,
  originType: personaOriginTypeSchema.default("USER"),
  distillFocus: z.array(z.string().min(1)).min(1).max(4),
});

export const updatePersonaSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  listingStatus: personaListingStatusSchema.optional(),
  status: personaStatusSchema.optional(),
});

export const personaSummarySchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  originType: personaOriginTypeSchema,
  personaType: personaTypeSchema,
  listingStatus: personaListingStatusSchema,
  status: personaStatusSchema,
  featuredRank: z.number().int().nullable(),
});

export const featuredPersonaSchema = personaSummarySchema.extend({
  currentPublishedVersionId: z.string().uuid(),
  previewIntro: z.string().nullable(),
  recommendedQuestions: z.array(z.string()),
});

export const featuredPersonaeResponseSchema = z.object({
  items: z.array(featuredPersonaSchema),
});

export const personaDetailResponseSchema = z.object({
  persona: personaSummarySchema.extend({
    currentPublishedVersionId: z.string().uuid(),
  }),
  version: z.object({
    id: z.string().uuid(),
    versionNumber: z.number().int().positive(),
    previewIntro: z.string().nullable(),
    recommendedQuestions: z.array(z.string()),
    sampleAnswers: z.array(z.string()),
    profileJson: z.record(z.string(), z.unknown()),
  }),
});

export const myPersonaSummarySchema = z.object({
  personaId: z.string().uuid(),
  displayName: z.string(),
  positioning: z.string().nullable(),
  previewIntro: z.string().nullable(),
  distillFocus: z.array(z.string()),
  status: personaStatusSchema,
  listingStatus: personaListingStatusSchema,
  currentDraftVersionId: z.string().uuid().nullable(),
  currentPublishedVersionId: z.string().uuid().nullable(),
  primaryShareSlug: z.string().nullable(),
  primaryShareUrl: z.string().url().nullable(),
  updatedAt: z.string(),
});

export const myPersonaeResponseSchema = z.object({
  stats: z.object({
    draftCount: z.number().int().nonnegative(),
    publishedCount: z.number().int().nonnegative(),
  }),
  items: z.array(myPersonaSummarySchema),
});
