import { personaListingStatusSchema, personaOriginTypeSchema, personaStatusSchema, personaTypeSchema } from "@hall-of-fame/domain";
import { z } from "zod";

export const createPersonaSchema = z.object({
  displayName: z.string().min(1).max(80),
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
