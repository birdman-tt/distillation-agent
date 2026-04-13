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
