import { z } from "zod";

const chatContextRoleSchema = z.enum(["SYSTEM", "USER", "ASSISTANT"]);
const chatMemoryReasonSchema = z.enum([
  "lexical_match",
  "followup_reference",
  "topic_overlap",
  "recent_anchor",
  "semantic_vector",
]);

export const searchChatMemoryToolInputSchema = z.object({
  toolName: z.literal("search_chat_memory"),
  version: z.literal("v1"),
  requestId: z.string().min(1),
  chatId: z.string().uuid(),
  personaId: z.string().uuid().nullable().optional(),
  personaVersionId: z.string().uuid(),
  query: z.string().min(1),
  latestMessageId: z.string().uuid().nullable().optional(),
  latestTurnIndex: z.number().int().positive().nullable().optional(),
  options: z
    .object({
      topK: z.number().int().positive().max(12).optional(),
      maxTokensHint: z.number().int().positive().max(4000).optional(),
      includeAssistant: z.boolean().optional(),
      includeUser: z.boolean().optional(),
      minScore: z.number().nonnegative().optional(),
      excludeRecentTurns: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export const searchChatMemoryHitSchema = z.object({
  messageId: z.string().uuid(),
  role: chatContextRoleSchema,
  content: z.string(),
  createdAt: z.string(),
  score: z.number().nonnegative(),
  reason: chatMemoryReasonSchema,
  turnDistance: z.number().int().nonnegative(),
});

export const searchChatMemoryToolOutputSchema = z.object({
  toolName: z.literal("search_chat_memory"),
  version: z.literal("v1"),
  requestId: z.string().min(1),
  chatId: z.string().uuid(),
  query: z.string().min(1),
  hits: z.array(searchChatMemoryHitSchema),
  summary: z.object({
    totalHits: z.number().int().nonnegative(),
    returnedHits: z.number().int().nonnegative(),
    truncated: z.boolean(),
    retrievalMode: z.enum(["fts_only", "fts_plus_recent"]),
  }),
});

export const searchChatMemoryToolErrorSchema = z.object({
  toolName: z.literal("search_chat_memory"),
  version: z.literal("v1"),
  requestId: z.string().min(1),
  error: z.object({
    code: z.enum(["CHAT_NOT_FOUND", "INVALID_INPUT", "REPOSITORY_ERROR"]),
    message: z.string().min(1),
  }),
});

export const chatContextTurnSchema = z.object({
  messageId: z.string().uuid(),
  role: chatContextRoleSchema,
  content: z.string(),
  createdAt: z.string(),
});

export const chatContextEvidenceSchema = z.object({
  sourceId: z.string().uuid(),
  title: z.string().nullable(),
  snippet: z.string(),
});

export const chatContextUserFactSchema = z.object({
  factType: z.string(),
  factValue: z.string(),
  sourceMessageId: z.string().uuid(),
  confidence: z.number(),
});

export const chatContextPersonaChunkSchema = z.object({
  scope: z.enum(["source", "profile"]),
  sourceId: z.string().uuid().nullable().optional(),
  title: z.string().nullable(),
  section: z.string().nullable(),
  content: z.string(),
  score: z.number(),
});

export const chatContextEnvelopeSchema = z.object({
  recentTurns: z.array(chatContextTurnSchema),
  retrievedMemories: z.array(searchChatMemoryHitSchema),
  userFacts: z.array(chatContextUserFactSchema).default([]),
  personaChunks: z.array(chatContextPersonaChunkSchema).default([]),
  personaEvidence: z.array(chatContextEvidenceSchema),
});
