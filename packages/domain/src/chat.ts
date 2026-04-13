import { z } from "zod";

export const chatTargetTypeSchema = z.enum([
  "published_persona",
  "draft_version_preview",
  "share_link",
]);
export type ChatTargetType = z.infer<typeof chatTargetTypeSchema>;

export const inferenceLevelSchema = z.enum([
  "grounded",
  "inferred",
  "insufficient_evidence",
]);
export type InferenceLevel = z.infer<typeof inferenceLevelSchema>;

export const refusalReasonSchema = z.enum([
  "none",
  "high_risk",
  "policy_blocked",
  "insufficient_evidence",
  "conflicting_evidence",
  "out_of_scope",
]);
export type RefusalReason = z.infer<typeof refusalReasonSchema>;
