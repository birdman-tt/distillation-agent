import { randomUUID } from "node:crypto";

import { chatContextEnvelopeSchema } from "@hall-of-fame/contracts";

import { listRecentChatMessages } from "../../store/chat-store.js";
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
    reason: "lexical_match" | "followup_reference" | "topic_overlap" | "recent_anchor";
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

export const assembleChatContext = async (input: {
  chatId: string;
  personaId?: string | null;
  personaVersionId: string;
  query: string;
  latestMessageId?: string | null;
  latestTurnIndex?: number | null;
  personaEvidence: Array<{
    sourceId: string;
    title: string | null;
    snippet: string;
  }>;
}) => {
  const memoryRequestId = randomUUID();
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

  const memoryResult = await searchChatMemory({
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
  });

  const recentIds = new Set(recentTurns.map((item) => item.messageId));
  const retrievedMemories = limitRetrievedMemories(memoryResult.hits).filter((item) => !recentIds.has(item.messageId));

  const context = chatContextEnvelopeSchema.parse({
    recentTurns: recentTurns.map((item) => ({
      messageId: item.messageId,
      role: item.role,
      content: item.content,
      createdAt: item.createdAt,
    })),
    retrievedMemories,
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
    },
  };
};
