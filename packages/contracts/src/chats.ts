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

export const chatMessageMetadataSchema = z.object({
  turnTraceId: z.string().min(1).optional(),
  source: z.enum(["reply", "proactive"]).optional(),
  sequence: z.number().int().positive().optional(),
  plannerModel: z.string().min(1).optional(),
  responderModel: z.string().min(1).optional(),
  proactiveJobId: z.string().uuid().optional(),
});

const plannerReplyModeSchema = z.enum(["CASUAL", "DOMAIN", "FACT", "HIGH_RISK"]);
const plannerPersonaIntensitySchema = z.enum(["low", "medium", "high"]);

export const chatResearchPlanSchema = z.object({
  subject: z.string().nullable(),
  subjectType: z.enum(["persona", "product", "company", "event", "unknown"]),
  normalizedQuestion: z.string(),
  searchQueries: z.array(z.string()).max(3),
  freshnessRequirement: z.enum(["latest_available", "current", "recent", "none"]),
  timeWindow: z.enum(["today", "this_week", "this_month", "this_year", "recent", "latest_available", "none"]),
  evidenceRequirement: z.object({
    minSources: z.number().int().min(1).max(3),
    requireUrl: z.boolean(),
  }),
  ifNoReliableSource: z.enum(["say_not_found_do_not_guess", "ask_clarify"]),
  asOf: z.string().nullable(),
  timezone: z.string().nullable(),
  currentYear: z.number().int().nullable(),
});

export const chatTurnPlanSchema = z.object({
  decisionSource: z.enum(["fast_planner", "minimax", "fallback"]).default("minimax"),
  userIntent: z.string(),
  replyMode: plannerReplyModeSchema.default("CASUAL"),
  personaIntensity: plannerPersonaIntensitySchema.default("low"),
  answerMode: z
    .enum(["casual", "domain", "memory_recall", "fresh_info", "high_risk", "proactive_candidate"])
    .default("casual"),
  retrievalHints: z
    .object({
      focusQueries: z.array(z.string()).default([]),
      boostScopes: z
        .array(z.enum(["user_facts", "chat_memory", "persona_chunks"]))
        .default([]),
    })
    .default({
      focusQueries: [],
      boostScopes: [],
    }),
  needChatMemory: z.boolean().default(false),
  needPersonaKnowledge: z.boolean().default(false),
  needWebSearch: z.boolean().default(false),
  webSearchQuery: z.string().nullable().default(null),
  webSearchReason: z.string().nullable().default(null),
  researchPlan: chatResearchPlanSchema.nullable().default(null),
  contextUsed: z.array(z.string()),
  replyGoal: z.string(),
  responseOutline: z.array(z.string()),
  shouldSendMultipleMessages: z.boolean(),
  suggestedMessageCount: z.number().int().min(1).max(3),
  avoidRepeating: z.array(z.string()),
  proactiveCandidate: z.object({
    shouldSchedule: z.boolean(),
    delaySeconds: z.number().int().positive().nullable(),
    topic: z.string().nullable(),
    reason: z.string().nullable(),
  }),
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
  ownedObjectId: z.string().uuid().nullable(),
  shareSlug: z.string().nullable(),
  displayName: z.string(),
  latestMessage: z.string(),
  updatedAt: z.string(),
});

export const chatSessionSummaryListSchema = z.object({
  items: z.array(chatSessionSummarySchema),
});
