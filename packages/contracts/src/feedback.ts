import { z } from "zod";

export const createFeedbackSchema = z.object({
  personaId: z.string().uuid(),
  personaVersionId: z.string().uuid(),
  chatMessageId: z.string().uuid().optional(),
  feedbackKind: z.enum(["LIKENESS", "GROUNDING"]),
  feedbackValue: z.enum(["POSITIVE", "NEGATIVE"]),
});
