import { z } from "zod";

export const shareChannelHintSchema = z.enum([
  "H5",
  "WECHAT_IN_APP",
  "WECHAT_SHARE_CARD",
]);
export type ShareChannelHint = z.infer<typeof shareChannelHintSchema>;

export const shareLinkSchema = z.object({
  id: z.string().uuid(),
  personaVersionId: z.string().uuid(),
  shareSlug: z.string().min(1),
  canonicalUrl: z.string().url(),
  miniappPath: z.string().min(1),
  channelHint: shareChannelHintSchema,
  isPrimary: z.boolean(),
  isActive: z.boolean(),
});
