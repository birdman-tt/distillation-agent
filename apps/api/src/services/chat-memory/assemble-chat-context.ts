import { randomUUID } from "node:crypto";

import { chatContextEnvelopeSchema } from "@hall-of-fame/contracts";

import { listRecentChatMessages } from "../../store/chat-store.js";
import { searchChatMemory } from "./search-chat-memory.js";

const keepFocusedRecentTurns = (
  turns: Array<{
    messageId: string;
    role: "SYSTEM" | "USER" | "ASSISTANT";
    content: string;
    createdAt: string;
    turnIndex: number;
  }>,
) => {
  const kept = turns.slice(-3);
  let assistantCount = 0;

  return kept.filter((turn) => {
    if (turn.role !== "ASSISTANT") {
      return true;
    }

    assistantCount += 1;
    return assistantCount > 1 ? false : true;
  });
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
  const recentTurns = keepFocusedRecentTurns(await listRecentChatMessages({
    chatId: input.chatId,
    limit: 3,
    excludeMessageIds: input.latestMessageId ? [input.latestMessageId] : [],
    roles: ["USER", "ASSISTANT"],
  }));

  const memoryResult = await searchChatMemory({
    toolName: "search_chat_memory",
    version: "v1",
    requestId: randomUUID(),
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
      excludeRecentTurns: 4,
    },
  });

  const recentIds = new Set(recentTurns.map((item) => item.messageId));
  const retrievedMemories = limitRetrievedMemories(memoryResult.hits).filter((item) => !recentIds.has(item.messageId));

  return chatContextEnvelopeSchema.parse({
    recentTurns: recentTurns.map((item) => ({
      messageId: item.messageId,
      role: item.role,
      content: item.content,
      createdAt: item.createdAt,
    })),
    retrievedMemories,
    personaEvidence: input.personaEvidence,
  });
};
