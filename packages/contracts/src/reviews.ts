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
