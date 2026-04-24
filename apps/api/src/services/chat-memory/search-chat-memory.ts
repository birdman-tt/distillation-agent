import {
  searchChatMemoryToolInputSchema,
  searchChatMemoryToolOutputSchema,
} from "@hall-of-fame/contracts";

import { listChatMessagesForMemorySearch } from "../../store/chat-store.js";

const FOLLOWUP_PATTERN = /(刚才|上面|你说的|前面|刚刚|继续|展开|接着|详细讲|具体讲|所以呢|那为什么|上一条|上一轮|那句)/u;

const normalize = (value: string) => value.trim().toLowerCase();

const buildHanNgrams = (segment: string) => {
  if (segment.length <= 1) {
    return [segment];
  }

  const tokens: string[] = [];
  for (const size of [2, 3]) {
    if (segment.length < size) {
      continue;
    }
    for (let index = 0; index <= segment.length - size; index += 1) {
      tokens.push(segment.slice(index, index + size));
    }
  }
  return tokens;
};

const tokenize = (value: string) => {
  const normalized = normalize(value);
  if (!normalized) {
    return [];
  }

  const latin = normalized.match(/[a-z0-9]{2,}/gu) ?? [];
  const hanSegments = normalized.match(/\p{Script=Han}+/gu) ?? [];
  const hanTokens = hanSegments.flatMap(buildHanNgrams);
  const tokens = new Set([...latin, ...hanTokens]);

  if (normalized.length >= 2 && normalized.length <= 24) {
    tokens.add(normalized);
  }

  return [...tokens];
};

const estimateTokens = (value: string) => Math.max(8, Math.ceil(value.length / 4));

const countOverlap = (queryTokens: string[], contentTokens: Set<string>) =>
  queryTokens.reduce((count, token) => count + (contentTokens.has(token) ? 1 : 0), 0);

export const searchChatMemory = async (
  rawInput: unknown,
) => {
  const input = searchChatMemoryToolInputSchema.parse(rawInput);
  const options = {
    topK: input.options?.topK ?? 6,
    maxTokensHint: input.options?.maxTokensHint ?? 900,
    includeAssistant: input.options?.includeAssistant ?? true,
    includeUser: input.options?.includeUser ?? true,
    minScore: input.options?.minScore ?? 0.32,
    excludeRecentTurns: input.options?.excludeRecentTurns ?? 4,
  };

  const roles = [
    ...(options.includeUser ? (["USER"] as const) : []),
    ...(options.includeAssistant ? (["ASSISTANT"] as const) : []),
  ];

  const candidates = await listChatMessagesForMemorySearch({
    chatId: input.chatId,
    candidateLimit: Math.max(options.topK * 8, 48),
    excludeMessageIds: input.latestMessageId ? [input.latestMessageId] : [],
    roles,
  });

  const latestTurnIndex = input.latestTurnIndex ?? (candidates.at(-1)?.turnIndex ?? 0);
  const normalizedQuery = normalize(input.query);
  const queryTokens = tokenize(input.query);
  const isFollowup = FOLLOWUP_PATTERN.test(input.query);

  const scoredHits = candidates
    .map((candidate) => {
      const turnDistance = latestTurnIndex > 0 && candidate.turnIndex > 0
        ? Math.max(latestTurnIndex - candidate.turnIndex, 0)
        : 0;

      if (turnDistance > 0 && turnDistance <= options.excludeRecentTurns) {
        return null;
      }

      const normalizedContent = normalize(candidate.content);
      const contentTokens = new Set(tokenize(candidate.content));
      const lexicalOverlap = queryTokens.length ? countOverlap(queryTokens, contentTokens) / queryTokens.length : 0;
      const exactMatch = normalizedQuery && normalizedContent.includes(normalizedQuery) ? 1 : 0;
      const recencyScore = latestTurnIndex > 0 ? Math.max(0, 1 - turnDistance / 18) : 0;
      const followupBoost = isFollowup && turnDistance > 0 && turnDistance <= 4 ? 0.55 - (turnDistance - 1) * 0.1 : 0;
      const roleBoost = candidate.role === "USER" ? 0.08 : 0.03;
      const finalScore = exactMatch * 1.05 + lexicalOverlap * 0.9 + recencyScore * 0.18 + followupBoost + roleBoost;

      if (finalScore < options.minScore) {
        return null;
      }

      const reason =
        followupBoost >= 0.45
          ? "followup_reference"
          : exactMatch > 0
            ? "lexical_match"
            : lexicalOverlap >= 0.34
              ? "topic_overlap"
              : "recent_anchor";

      return {
        messageId: candidate.messageId,
        role: candidate.role,
        content: candidate.content,
        createdAt: candidate.createdAt,
        score: Number(finalScore.toFixed(4)),
        reason,
        turnDistance,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => right.score - left.score || left.turnDistance - right.turnDistance);

  let consumedTokens = 0;
  const hits = [];
  for (const hit of scoredHits) {
    if (hits.length >= options.topK) {
      break;
    }

    const estimatedTokens = estimateTokens(hit.content);
    if (hits.length > 0 && consumedTokens + estimatedTokens > options.maxTokensHint) {
      break;
    }

    hits.push(hit);
    consumedTokens += estimatedTokens;
  }

  return searchChatMemoryToolOutputSchema.parse({
    toolName: "search_chat_memory",
    version: "v1",
    requestId: input.requestId,
    chatId: input.chatId,
    query: input.query,
    hits,
    summary: {
      totalHits: scoredHits.length,
      returnedHits: hits.length,
      truncated: scoredHits.length > hits.length,
      retrievalMode: isFollowup ? "fts_plus_recent" : "fts_only",
    },
  });
};
