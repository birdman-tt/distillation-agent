import { z } from "zod";

export const personaOriginTypeSchema = z.enum(["OFFICIAL", "USER"]);
export type PersonaOriginType = z.infer<typeof personaOriginTypeSchema>;

export const personaTypeSchema = z.enum([
  "HISTORICAL_FIGURE",
  "AUTHOR_OR_BLOGGER",
  "ORIGINAL_PERSONA",
]);
export type PersonaType = z.infer<typeof personaTypeSchema>;

export const personaListingStatusSchema = z.enum([
  "PRIVATE",
  "UNLISTED",
  "FEATURED",
  "REMOVED",
]);
export type PersonaListingStatus = z.infer<typeof personaListingStatusSchema>;

export const personaStatusSchema = z.enum([
  "DRAFT",
  "PROCESSING",
  "READY",
  "PUBLISHED",
  "REJECTED",
]);
export type PersonaStatus = z.infer<typeof personaStatusSchema>;

export const personaeTableSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1),
  originType: personaOriginTypeSchema,
  personaType: personaTypeSchema,
  listingStatus: personaListingStatusSchema,
  status: personaStatusSchema,
  creatorUserId: z.string().uuid().nullable(),
  currentDraftVersionId: z.string().uuid().nullable(),
  currentPublishedVersionId: z.string().uuid().nullable(),
});

export const canAppearInFeaturedHall = (input: {
  originType: PersonaOriginType;
  listingStatus: PersonaListingStatus;
}): boolean =>
  input.originType === "OFFICIAL" && input.listingStatus === "FEATURED";
