import { reviewDecisionSchema } from "@hall-of-fame/domain";
import { z } from "zod";

export const reviewSourceSchema = z.object({
  sourceId: z.string().uuid(),
  decision: reviewDecisionSchema,
  reason: z.string().min(1).max(500),
});

export const reviewPersonaVersionPublishSchema = z.object({
  personaVersionId: z.string().uuid(),
  decision: reviewDecisionSchema,
  reason: z.string().min(1).max(500),
});

export const pendingSourceReviewItemSchema = z.object({
  sourceId: z.string().uuid(),
  personaId: z.string().uuid(),
  displayName: z.string(),
  sourceTitle: z.string().nullable(),
  reviewStatus: z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED"]),
  createdAt: z.string(),
});

export const pendingVersionReviewItemSchema = z.object({
  personaVersionId: z.string().uuid(),
  personaId: z.string().uuid(),
  displayName: z.string(),
  versionNumber: z.number().int().positive(),
  status: z.enum(["DRAFT", "CANDIDATE", "PENDING_PUBLISH_REVIEW", "PUBLISHED", "SUPERSEDED", "REJECTED"]),
  submittedForPublishAt: z.string().nullable(),
});

export const listPendingSourceReviewsResponseSchema = z.object({
  items: z.array(pendingSourceReviewItemSchema),
});

export const listPendingVersionReviewsResponseSchema = z.object({
  items: z.array(pendingVersionReviewItemSchema),
});
