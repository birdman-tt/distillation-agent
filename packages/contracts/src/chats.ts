import { chatTargetTypeSchema, inferenceLevelSchema, refusalReasonSchema } from "@hall-of-fame/domain";
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

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["SYSTEM", "USER", "ASSISTANT"]),
  content: z.string(),
  basis: chatReplySchema.shape.basis.nullable(),
  basisSummary: chatReplySchema.shape.basisSummary.nullable(),
  inferenceLevel: inferenceLevelSchema.nullable(),
  conflictDetected: z.boolean().nullable(),
  refusalReason: refusalReasonSchema.nullable(),
  createdAt: z.string(),
});

export const chatSessionSchema = z.object({
  id: z.string().uuid(),
  targetType: chatTargetTypeSchema,
  targetPersonaId: z.string().uuid().nullable(),
  targetPersonaVersionId: z.string().uuid(),
  shareSlug: z.string().nullable(),
  messages: z.array(chatMessageSchema),
});

export const chatSessionSummarySchema = z.object({
  id: z.string().uuid(),
  targetType: chatTargetTypeSchema,
  resumePersonaId: z.string().uuid().nullable(),
  targetPersonaVersionId: z.string().uuid(),
  shareSlug: z.string().nullable(),
  displayName: z.string(),
  latestMessage: z.string(),
  updatedAt: z.string(),
});

export const chatSessionSummaryListSchema = z.object({
  items: z.array(chatSessionSummarySchema),
});
