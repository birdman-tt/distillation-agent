import { personaProfileSchema, sourceKindSchema } from "@hall-of-fame/domain";
import { z } from "zod";

export const distillSourceFragmentSchema = z.object({
  sourceId: z.string().uuid(),
  sourceKind: sourceKindSchema,
  title: z.string().nullable(),
  summary: z.string(),
});

export const distillPreviewSchema = z.object({
  previewIntro: z.string(),
  recommendedQuestions: z.array(z.string()).length(3),
  sampleAnswers: z.array(z.string()).min(2).max(3),
});

export const distillScoresSchema = z.object({
  coverageScore: z.number().int().min(0).max(100),
  groundingScore: z.number().int().min(0).max(100),
  styleScore: z.number().int().min(0).max(100),
  riskScore: z.number().int().min(0).max(100),
});

export const distillOutputSchema = z.object({
  profile: personaProfileSchema,
  preview: distillPreviewSchema,
  scores: distillScoresSchema,
});

export type DistillOutput = z.infer<typeof distillOutputSchema>;
