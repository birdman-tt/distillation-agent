import { randomUUID } from "node:crypto";

import { chatContextEnvelopeSchema } from "@hall-of-fame/contracts";

import {
  listActiveUserMemoryFacts,
  searchChatMessageEmbeddings,
  searchPersonaProfileChunkEmbeddings,
  searchPersonaSourceChunkEmbeddings,
} from "../../db/repositories/chat-retrieval-repository.js";
import { listRecentChatMessages } from "../../store/chat-store.js";
import { readEmbeddingConfig, type EmbeddingConfig } from "../embeddings/embedding-config.js";
import { requestQwenEmbeddings } from "../embeddings/qwen-embedding-client.js";
import { searchChatMemory } from "./search-chat-memory.js";

const DEFAULT_DEEPSEEK_CONTEXT_WINDOW_TOKENS = 1_000_000;
const DEFAULT_OUTPUT_RESERVE_TOKENS = 4_096;
const DEFAULT_STATIC_PROMPT_RESERVE_TOKENS = 12_000;
const DEFAULT_MAX_HISTORY_MESSAGES = 1_000;

const readPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const readHistoryTokenBudget = () => {
  const explicitBudget = process.env.CHAT_CONTEXT_MAX_INPUT_TOKENS;
  if (explicitBudget) {
    return readPositiveInteger(explicitBudget, 64_000);
  }

  const contextWindow = readPositiveInteger(
    process.env.DEEPSEEK_CONTEXT_WINDOW_TOKENS,
    DEFAULT_DEEPSEEK_CONTEXT_WINDOW_TOKENS,
  );
  const outputReserve = readPositiveInteger(
    process.env.CHAT_CONTEXT_OUTPUT_RESERVE_TOKENS,
    DEFAULT_OUTPUT_RESERVE_TOKENS,
  );
  const staticPromptReserve = readPositiveInteger(
    process.env.CHAT_CONTEXT_STATIC_PROMPT_RESERVE_TOKENS,
    DEFAULT_STATIC_PROMPT_RESERVE_TOKENS,
  );

  return Math.max(1_024, contextWindow - outputReserve - staticPromptReserve);
};

const readMaxHistoryMessages = () =>
  readPositiveInteger(process.env.CHAT_CONTEXT_MAX_HISTORY_MESSAGES, DEFAULT_MAX_HISTORY_MESSAGES);

const readQwenBaseUrl = () => process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
const readQwenApiKey = () => process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "";
const readChatVectorTopK = () => readPositiveInteger(process.env.CHAT_RETRIEVAL_CHAT_TOP_K, 8);
const readPersonaVectorTopK = () => readPositiveInteger(process.env.CHAT_RETRIEVAL_PERSONA_TOP_K, 8);
const readChatVectorMinScore = () => {
  const parsed = Number(process.env.CHAT_RETRIEVAL_CHAT_VECTOR_MIN_SCORE ?? "0.28");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.28;
};
const readPersonaVectorMinScore = () => {
  const parsed = Number(process.env.CHAT_RETRIEVAL_PERSONA_VECTOR_MIN_SCORE ?? "0.28");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.28;
};
export const readChatQueryEmbeddingTimeoutMs = () => {
  const rawValue = process.env.CHAT_QUERY_EMBEDDING_TIMEOUT_MS;
  if (!rawValue?.trim()) {
    return 800;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 800;
  }

  return Math.max(50, Math.floor(parsed));
};
const isChatVectorRetrievalEnabled = () => process.env.CHAT_VECTOR_RETRIEVAL_ENABLED !== "false";
const isPersonaVectorRetrievalEnabled = () => process.env.PERSONA_VECTOR_RETRIEVAL_ENABLED !== "false";
const isVectorRetrievalEnabled = () =>
  (isChatVectorRetrievalEnabled() || isPersonaVectorRetrievalEnabled()) && Boolean(readQwenApiKey());

const estimateTextTokens = (value: string) => Math.max(1, Math.ceil(Buffer.byteLength(value, "utf8") / 3));

const estimateTurnTokens = (turn: { role: "SYSTEM" | "USER" | "ASSISTANT"; content: string }) =>
  16 + estimateTextTokens(turn.role) + estimateTextTokens(turn.content);

const selectHistoryWithinBudget = (
  turns: Array<{
    messageId: string;
    role: "SYSTEM" | "USER" | "ASSISTANT";
    content: string;
    createdAt: string;
    turnIndex: number;
  }>,
  maxTokens: number,
) => {
  const selected = [];
  let estimatedTokens = 0;

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]!;
    const turnTokens = estimateTurnTokens(turn);
    if (selected.length > 0 && estimatedTokens + turnTokens > maxTokens) {
      break;
    }

    selected.unshift(turn);
    estimatedTokens += turnTokens;
  }

  return {
    turns: selected,
    estimatedTokens,
    truncated: selected.length < turns.length,
    originalTurnCount: turns.length,
  };
};

const limitRetrievedMemories = (
  hits: Array<{
    messageId: string;
    role: "SYSTEM" | "USER" | "ASSISTANT";
    content: string;
    createdAt: string;
    score: number;
    reason: "lexical_match" | "followup_reference" | "topic_overlap" | "recent_anchor" | "semantic_vector";
    turnDistance: number;
  }>,
) => {
  const userHits = hits.filter((item) => item.role === "USER").slice(0, 4);
  const assistantHits = hits
    .filter((item) => item.role === "ASSISTANT" && item.score >= 0.78)
    .slice(0, 1);

  return [...userHits, ...assistantHits].sort(
    (left, right) => left.turnDistance - right.turnDistance || right.score - left.score,
  );
};

type RetrievedMemoryHit = {
  messageId: string;
  role: "SYSTEM" | "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  score: number;
  reason: "lexical_match" | "followup_reference" | "topic_overlap" | "recent_anchor" | "semantic_vector";
  turnDistance: number;
};

type PersonaChunkHit = {
  scope: "source" | "profile";
  sourceId?: string | null;
  title: string | null;
  section: string | null;
  content: string;
  score: number;
};

type EmbeddingRequester = (input: {
  model: string;
  dimensions: number;
  inputs: string[];
  signal?: AbortSignal;
}) => Promise<number[][]>;

export class ChatQueryEmbeddingTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`query_embedding_timeout:${timeoutMs}`);
    this.name = "ChatQueryEmbeddingTimeoutError";
  }
}

export const requestQueryEmbeddingsWithTimeout = async (
  request: {
    model: string;
    dimensions: number;
    inputs: string[];
  },
  deps: {
    requestEmbeddings: EmbeddingRequester;
    timeoutMs?: number;
  },
) => {
  const timeoutMs = deps.timeoutMs ?? readChatQueryEmbeddingTimeoutMs();
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      deps.requestEmbeddings({
        ...request,
        signal: controller.signal,
      }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new ChatQueryEmbeddingTimeoutError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const mergeRetrievedMemories = (hits: RetrievedMemoryHit[]) => {
  const byMessageId = new Map<string, RetrievedMemoryHit>();
  for (const hit of hits) {
    const existing = byMessageId.get(hit.messageId);
    if (!existing || hit.score > existing.score) {
      byMessageId.set(hit.messageId, hit);
    }
  }

  return [...byMessageId.values()].sort((left, right) => right.score - left.score || left.turnDistance - right.turnDistance);
};

export const assembleChatContext = async (input: {
  chatId: string;
  personaId?: string | null;
  personaVersionId: string;
  query: string;
  latestMessageId?: string | null;
  latestTurnIndex?: number | null;
  includeChatMemory?: boolean;
  includePersonaKnowledge?: boolean;
  personaEvidence: Array<{
    sourceId: string;
    title: string | null;
    snippet: string;
  }>;
}, deps: {
  readConfig?: () => EmbeddingConfig;
  requestEmbeddings?: EmbeddingRequester;
  isVectorRetrievalEnabled?: () => boolean;
} = {}) => {
  const memoryRequestId = randomUUID();
  const includeChatMemory = input.includeChatMemory ?? true;
  const includePersonaKnowledge = input.includePersonaKnowledge ?? true;
  const maxHistoryMessages = readMaxHistoryMessages();
  const historyTokenBudget = readHistoryTokenBudget();
  const fullHistory = await listRecentChatMessages({
    chatId: input.chatId,
    limit: maxHistoryMessages,
    excludeMessageIds: input.latestMessageId ? [input.latestMessageId] : [],
    roles: ["USER", "ASSISTANT"],
  });
  const budgetedHistory = selectHistoryWithinBudget(fullHistory, historyTokenBudget);
  const recentTurns = budgetedHistory.turns;

  const memoryResult = includeChatMemory
    ? await searchChatMemory({
        toolName: "search_chat_memory",
        version: "v1",
        requestId: memoryRequestId,
        chatId: input.chatId,
        personaId: input.personaId ?? null,
        personaVersionId: input.personaVersionId,
        query: input.query,
        latestMessageId: input.latestMessageId ?? null,
        latestTurnIndex: input.latestTurnIndex ?? null,
        options: {
          topK: 6,
          maxTokensHint: 900,
          includeAssistant: true,
          includeUser: true,
          minScore: 0.32,
          excludeRecentTurns: recentTurns.length,
        },
      })
    : {
        toolName: "search_chat_memory" as const,
        version: "v1" as const,
        requestId: memoryRequestId,
        chatId: input.chatId,
        query: input.query,
        hits: [],
        summary: {
          totalHits: 0,
          returnedHits: 0,
          truncated: false,
          retrievalMode: "fts_only" as const,
        },
      };

  const recentIds = new Set(recentTurns.map((item) => item.messageId));
  const vectorDiagnostics: {
    enabled: boolean;
    returnedHits: number;
    personaSourceHits: number;
    personaProfileHits: number;
    errorMessage: string | null;
  } = {
    enabled:
      (includeChatMemory || includePersonaKnowledge) &&
      (deps.isVectorRetrievalEnabled?.() ?? isVectorRetrievalEnabled()),
    returnedHits: 0,
    personaSourceHits: 0,
    personaProfileHits: 0,
    errorMessage: null,
  };
  const vectorHits: RetrievedMemoryHit[] = [];
  const personaChunks: PersonaChunkHit[] = [];
  if (vectorDiagnostics.enabled) {
    try {
      const config = deps.readConfig?.() ?? readEmbeddingConfig();
      const requestEmbeddings =
        deps.requestEmbeddings ??
        ((request: { model: string; dimensions: number; inputs: string[]; signal?: AbortSignal }) =>
          requestQwenEmbeddings(
            {
              apiKey: readQwenApiKey(),
              baseUrl: readQwenBaseUrl(),
              model: request.model,
              dimensions: request.dimensions,
              inputs: request.inputs,
            },
            { signal: request.signal },
          ));
      const [queryEmbedding] = await requestQueryEmbeddingsWithTimeout(
        {
          model: config.model,
          dimensions: config.dimensions,
          inputs: [input.query],
        },
        {
          requestEmbeddings,
        },
      );

      if (queryEmbedding) {
        const chatVectorEnabled =
          includeChatMemory &&
          (deps.isVectorRetrievalEnabled ? vectorDiagnostics.enabled : isChatVectorRetrievalEnabled());
        const personaVectorEnabled =
          includePersonaKnowledge &&
          (deps.isVectorRetrievalEnabled ? vectorDiagnostics.enabled : isPersonaVectorRetrievalEnabled());

        if (chatVectorEnabled) {
          const vectorRows = await searchChatMessageEmbeddings({
            chatId: input.chatId,
            embedding: queryEmbedding,
            embeddingModel: config.model,
            limit: readChatVectorTopK(),
            roles: ["USER", "ASSISTANT"],
            excludeMessageIds: input.latestMessageId ? [input.latestMessageId] : [],
            latestTurnIndex: input.latestTurnIndex ?? null,
          });
          const minScore = readChatVectorMinScore();
          for (const row of vectorRows) {
            const turnDistance =
              input.latestTurnIndex && row.turnIndex > 0 ? Math.max(input.latestTurnIndex - row.turnIndex, 0) : 0;
            if (row.score < minScore) {
              continue;
            }
            vectorHits.push({
              messageId: row.messageId,
              role: row.role,
              content: row.content,
              createdAt: row.createdAt,
              score: Number(row.score.toFixed(4)),
              reason: "semantic_vector",
              turnDistance,
            });
          }
        }

        if (personaVectorEnabled) {
          const personaMinScore = readPersonaVectorMinScore();
          const [personaSourceRows, personaProfileRows] = await Promise.all([
            searchPersonaSourceChunkEmbeddings({
              personaVersionId: input.personaVersionId,
              embedding: queryEmbedding,
              embeddingModel: config.model,
              limit: readPersonaVectorTopK(),
            }),
            searchPersonaProfileChunkEmbeddings({
              personaVersionId: input.personaVersionId,
              embedding: queryEmbedding,
              embeddingModel: config.model,
              limit: readPersonaVectorTopK(),
            }),
          ]);

          for (const row of personaSourceRows.filter((item) => item.score >= personaMinScore).slice(0, 4)) {
            personaChunks.push({
              scope: "source",
              sourceId: row.sourceId,
              title: row.title,
              section: null,
              content: row.content,
              score: Number(row.score.toFixed(4)),
            });
          }
          for (const row of personaProfileRows.filter((item) => item.score >= personaMinScore).slice(0, 4)) {
            personaChunks.push({
              scope: "profile",
              sourceId: null,
              title: null,
              section: row.section,
              content: row.content,
              score: Number(row.score.toFixed(4)),
            });
          }
          vectorDiagnostics.personaSourceHits = personaChunks.filter((item) => item.scope === "source").length;
          vectorDiagnostics.personaProfileHits = personaChunks.filter((item) => item.scope === "profile").length;
        }
      }
      vectorDiagnostics.returnedHits = vectorHits.length;
    } catch (error) {
      vectorDiagnostics.errorMessage =
        error instanceof ChatQueryEmbeddingTimeoutError
          ? "query_embedding_timeout"
          : error instanceof Error
            ? error.message
            : "unknown error";
    }
  }
  const retrievedMemories = mergeRetrievedMemories([
    ...limitRetrievedMemories(memoryResult.hits),
    ...vectorHits,
  ]).filter((item) => !recentIds.has(item.messageId));
  const userFacts = await listActiveUserMemoryFacts({
    chatId: input.chatId,
  });

  const context = chatContextEnvelopeSchema.parse({
    recentTurns: recentTurns.map((item) => ({
      messageId: item.messageId,
      role: item.role,
      content: item.content,
      createdAt: item.createdAt,
    })),
    retrievedMemories,
    userFacts: userFacts.map((item) => ({
      factType: item.factType,
      factValue: item.factValue,
      sourceMessageId: item.sourceMessageId,
      confidence: item.confidence,
    })),
    personaChunks,
    personaEvidence: input.personaEvidence,
  });

  return {
    ...context,
    diagnostics: {
      memorySearch: {
        requestId: memoryRequestId,
        totalHits: memoryResult.summary.totalHits,
        returnedHits: memoryResult.summary.returnedHits,
        truncated: memoryResult.summary.truncated,
        retrievalMode: memoryResult.summary.retrievalMode,
        topHits: memoryResult.hits.slice(0, 3).map((item) => ({
          messageId: item.messageId,
          score: item.score,
          reason: item.reason,
          turnDistance: item.turnDistance,
        })),
      },
      contextBudget: {
        maxInputTokens: historyTokenBudget,
        estimatedHistoryTokens: budgetedHistory.estimatedTokens,
        maxHistoryMessages,
        originalTurnCount: budgetedHistory.originalTurnCount,
        includedTurnCount: recentTurns.length,
        truncated: budgetedHistory.truncated,
      },
      userFacts: {
        totalActiveFacts: userFacts.length,
      },
      vectorSearch: vectorDiagnostics,
      retrievalPlan: {
        includeChatMemory,
        includePersonaKnowledge,
      },
    },
  };
};
