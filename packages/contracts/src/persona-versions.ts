import { personaVersionStatusSchema } from "@hall-of-fame/domain";
import { z } from "zod";

export const submitPublishReviewSchema = z.object({
  versionId: z.string().uuid(),
});

export const personaVersionResponseSchema = z.object({
  id: z.string().uuid(),
  personaId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  status: personaVersionStatusSchema,
  profileJson: z.record(z.string(), z.unknown()),
  previewIntro: z.string().nullable(),
  recommendedQuestions: z.array(z.string()),
  sampleAnswers: z.array(z.string()),
  coverageScore: z.number().int().nullable(),
  groundingScore: z.number().int().nullable(),
  styleScore: z.number().int().nullable(),
  riskScore: z.number().int().nullable(),
});

export const personaVersionListResponseSchema = z.object({
  items: z.array(personaVersionResponseSchema),
});
