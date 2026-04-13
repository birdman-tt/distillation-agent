import { z } from "zod";

export const reviewDecisionSchema = z.enum(["APPROVED", "REJECTED"]);
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export const reviewActorRoleSchema = z.enum(["ADMIN", "EDITOR", "REVIEWER"]);
export type ReviewActorRole = z.infer<typeof reviewActorRoleSchema>;
