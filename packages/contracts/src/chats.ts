import { inferenceLevelSchema, refusalReasonSchema } from "@hall-of-fame/domain";
import { z } from "zod";

export const createChatSchema = z.discriminatedUnion("targetType", [
  z.object({
    targetType: z.literal("published_persona"),
    personaId: z.string().uuid(),
  }),
  z.object({
    targetType: z.literal("draft_version_preview"),
    personaVersionId: z.string().uuid(),
  }),
  z.object({
    targetType: z.literal("share_link"),
    shareSlug: z.string().min(1),
  }),
]);

export const createChatMessageSchema = z.object({
  content: z.string().min(1),
});

export const chatReplySchema = z.object({
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
