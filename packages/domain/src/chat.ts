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

export const HIGH_RISK_QUESTION_PATTERN =
  /(投资|股票|买入|卖出|仓位|止损|医疗|法律|诊断|处方|荐股|移民|合同|税务)/i;

export const isHighRiskQuestion = (content: string) => HIGH_RISK_QUESTION_PATTERN.test(content);
