import { z } from "zod";

export const personaVersionStatusSchema = z.enum([
  "DRAFT",
  "CANDIDATE",
  "PENDING_PUBLISH_REVIEW",
  "PUBLISHED",
  "SUPERSEDED",
  "REJECTED",
]);
export type PersonaVersionStatus = z.infer<typeof personaVersionStatusSchema>;

export const qualityGateSchema = z.object({
  approvedSourcesMinimum: z.number().int().nonnegative(),
  primaryOrSecondarySourcesMinimum: z.number().int().nonnegative(),
  coverageScoreMinimum: z.number().int().min(0).max(100),
  groundingScoreMinimum: z.number().int().min(0).max(100),
  styleScoreMinimum: z.number().int().min(0).max(100),
  riskScoreMaximum: z.number().int().min(0).max(100),
});

export const defaultPublishQualityGate = qualityGateSchema.parse({
  approvedSourcesMinimum: 5,
  primaryOrSecondarySourcesMinimum: 2,
  coverageScoreMinimum: 70,
  groundingScoreMinimum: 80,
  styleScoreMinimum: 60,
  riskScoreMaximum: 30,
});
