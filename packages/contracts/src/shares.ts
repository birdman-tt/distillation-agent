import { shareChannelHintSchema } from "@hall-of-fame/domain";
import { z } from "zod";

export const createShareSchema = z.object({
  channelHint: shareChannelHintSchema.default("H5"),
});

export const shareLinkResponseSchema = z.object({
  id: z.string().uuid(),
  personaVersionId: z.string().uuid(),
  shareSlug: z.string(),
  canonicalUrl: z.string().url(),
  miniappPath: z.string(),
  channelHint: shareChannelHintSchema,
  isPrimary: z.boolean(),
  isActive: z.boolean(),
});

export const shareLandingResponseSchema = z.object({
  share: shareLinkResponseSchema,
  persona: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
    originType: z.enum(["OFFICIAL", "USER"]),
  }),
  version: z.object({
    id: z.string().uuid(),
    versionNumber: z.number().int().positive(),
    previewIntro: z.string().nullable(),
    recommendedQuestions: z.array(z.string()),
  }),
});
