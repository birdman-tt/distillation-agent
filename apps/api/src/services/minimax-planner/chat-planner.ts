import { randomUUID } from "node:crypto";

import { chatTurnPlanSchema } from "@hall-of-fame/contracts";
import type { z } from "zod";

import { createChatProactiveJob } from "../../db/repositories/chat-proactive-repository.js";
import { getPersonaDetail, getPersonaVersion } from "../../store/persona-store.js";
import { listChatMessagesForMemorySearch, listRecentChatMessages } from "../../store/chat-store.js";
import { searchChatMemory } from "../chat-memory/search-chat-memory.js";
import {
  MiniMaxPlannerNotConfiguredError,
  MiniMaxPlannerParseError,
  runMiniMaxToolLoop,
  type MiniMaxTool,
} from "./minimax-client.js";

type ChatTurnPlan = z.infer<typeof chatTurnPlanSchema>;

type PlannerTraceSink = (event: {
  eventName: string;
  stage: string;
  status: string;
  level?: "info" | "warn" | "error";
  durationMs?: number;
  fields?: Record<string, unknown>;
  artifacts?: Array<
    | {
        artifactKey: string;
        kind: "json";
        value: unknown;
        contentType?: string;
      }
    | {
        artifactKey: string;
        kind: "text";
        value: string;
        contentType?: string;
      }
  >;
}) => void;

export const isChatPlannerEnabled = () => process.env.CHAT_PLANNER_ENABLED === "true";
export const isChatProactiveEnabled = () => process.env.CHAT_PROACTIVE_ENABLED === "true";

const readPlannerTimeoutMs = () => Number(process.env.CHAT_PLANNER_TIMEOUT_MS ?? "6000");
const readPlannerToolTimeoutMs = () => Number(process.env.CHAT_PLANNER_TOOL_TIMEOUT_MS ?? "1500");
const readPlannerModel = () => process.env.MINIMAX_PLANNER_MODEL ?? "MiniMax-M2.7";

export const isExplicitProactiveRequest = (content: string) =>
  /(提醒|稍后|一会儿|一会|等下|待会|过会|回头|晚点|明天|下次|别忘|分钟后|小时后|天后|remind|later|follow up)/iu.test(content);

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string, onTimeout?: () => void) => {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout?.();
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const byteLength = (value: string) => Buffer.byteLength(value, "utf8");

const trimJsonToMaxBytes = (value: unknown, maxBytes: number) => {
  const json = JSON.stringify(value);
  if (byteLength(json) <= maxBytes) {
    return value;
  }

  if (!value || typeof value !== "object" || !("messages" in value) || !Array.isArray((value as { messages?: unknown }).messages)) {
    return {
      truncated: true,
      preview: Buffer.from(json).subarray(0, Math.max(2, maxBytes - 32)).toString("utf8"),
    };
  }

  const clone = {
    ...(value as Record<string, unknown>),
    messages: [...((value as { messages: unknown[] }).messages)],
  };
  while (clone.messages.length > 1 && byteLength(JSON.stringify(clone)) > maxBytes) {
    clone.messages.shift();
  }
  return clone;
};

const buildPlannerSystemPrompt = () =>
  [
    "你是聊天后端的 Agent Planner，不直接写用户可见回复。",
    "你负责判断当前问题是否需要历史上下文、记忆或人物资料；不要依赖后端规则替你决定。",
    "如果当前消息和初始上下文已经足够回答，就不要调用工具。",
    "如果用户问自己此前说过的信息，例如名字、外号、偏好、地点、计划、上次说过什么、刚才聊到什么，先调用 get_chat_context 或 search_chat_memory 再给计划。",
    "如果用户要求延续前文、总结历史、比较多轮观点、安排稍后提醒，也应优先通过工具确认上下文。",
    "把工具里确认的关键事实写进 contextUsed 和 responseOutline，供最终 responder 使用。",
    "如果工具结果仍没有答案，在 responseOutline 里明确要求 responder 不要编造，只能自然说明暂时没看到。",
    "最终必须只输出一个 JSON object，不要输出 Markdown，不要解释。",
    "严格按这个 TypeScript 形状输出：",
    "{",
    '  "userIntent": string,',
    '  "contextUsed": string[],',
    '  "replyGoal": string,',
    '  "responseOutline": string[],',
    '  "shouldSendMultipleMessages": boolean,',
    '  "suggestedMessageCount": 1 | 2 | 3,',
    '  "avoidRepeating": string[],',
    '  "proactiveCandidate": {',
    '    "shouldSchedule": boolean,',
    '    "delaySeconds": number | null,',
    '    "topic": string | null,',
    '    "reason": string | null',
    "  }",
    "}",
    "数组字段必须输出数组；没有内容时输出 []，不能输出 false、空、无、空字符串。",
    '如果不安排主动消息，proactiveCandidate 必须是 {"shouldSchedule":false,"delaySeconds":null,"topic":null,"reason":null}。',
    "proactiveCandidate 默认必须为不安排。只有用户明确要求稍后提醒/继续，或上下文强烈需要自然补一句时才安排。",
    "用户只是问候、认同、笑、寒暄、结束话题、情绪轻松承接时，不要安排 proactiveCandidate。",
    "不要把内部分析、用户意图判断、planner reason 暴露为用户可见内容。",
    '示例：{"userIntent":"问候","contextUsed":[],"replyGoal":"自然回应","responseOutline":["简短回应"],"shouldSendMultipleMessages":false,"suggestedMessageCount":1,"avoidRepeating":[],"proactiveCandidate":{"shouldSchedule":false,"delaySeconds":null,"topic":null,"reason":null}}',
  ].join("\n");

const buildPlannerUserPrompt = (input: {
  content: string;
  chatId: string;
  personaVersionId: string;
  recentContextPreview: unknown;
}) =>
  [
    `chatId=${input.chatId}`,
    `personaVersionId=${input.personaVersionId}`,
    "[Current User Message]",
    input.content,
    "[Initial Context Preview]",
    JSON.stringify(input.recentContextPreview),
  ].join("\n\n");

const buildPlannerTools = (input: {
  chatId: string;
  personaId: string | null;
  personaVersionId: string;
  query: string;
  latestMessageId: string | null;
  latestTurnIndex: number | null;
  turnTraceId: string;
}): MiniMaxTool[] => {
  const tools: MiniMaxTool[] = [
    {
      name: "get_chat_context",
      description: "Return bounded chat context for the current chat.",
      parameters: {
        type: "object",
        properties: {
          maxBytes: { type: "number", description: "Maximum UTF-8 bytes to return, capped at 204800." },
        },
      },
      execute: async (raw) =>
        withTimeout(
          (async () => {
            const maxBytes = Math.min(Math.max(Number((raw as { maxBytes?: unknown })?.maxBytes ?? 204800), 1024), 204800);
            const messages = await listChatMessagesForMemorySearch({
              chatId: input.chatId,
              candidateLimit: 80,
              roles: ["USER", "ASSISTANT"],
            });
            return trimJsonToMaxBytes({ messages }, maxBytes);
          })(),
          readPlannerToolTimeoutMs(),
          "get_chat_context timed out",
        ),
    },
    {
      name: "search_chat_memory",
      description: "Search relevant prior chat messages by query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          topK: { type: "number" },
        },
        required: ["query"],
      },
      execute: async (raw) =>
        withTimeout(
          searchChatMemory({
            toolName: "search_chat_memory",
            version: "v1",
            requestId: randomUUID(),
            chatId: input.chatId,
            personaId: input.personaId,
            personaVersionId: input.personaVersionId,
            query: String((raw as { query?: unknown })?.query ?? input.query),
            latestMessageId: input.latestMessageId,
            latestTurnIndex: input.latestTurnIndex,
            options: {
              topK: Math.min(Math.max(Number((raw as { topK?: unknown })?.topK ?? 6), 1), 12),
              maxTokensHint: 1200,
              includeAssistant: true,
              includeUser: true,
              minScore: 0.2,
              excludeRecentTurns: 2,
            },
          }),
          readPlannerToolTimeoutMs(),
          "search_chat_memory timed out",
        ),
    },
    {
      name: "get_persona_profile",
      description: "Return persona profile and sample style for the current persona version.",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async () =>
        withTimeout(
          (async () => {
            const version = await getPersonaVersion(input.personaVersionId);
            const persona = input.personaId ? (await getPersonaDetail(input.personaId))?.persona ?? null : null;
            return {
              displayName: persona?.displayName ?? "User Persona",
              previewIntro: version?.previewIntro ?? null,
              profileSummary:
                version && typeof version.profileJson.summary === "string" ? version.profileJson.summary : null,
              sampleAnswers: version?.sampleAnswers ?? [],
              recommendedQuestions: version?.recommendedQuestions ?? [],
            };
          })(),
          readPlannerToolTimeoutMs(),
          "get_persona_profile timed out",
        ),
    },
  ];

  if (isChatProactiveEnabled()) {
    tools.push({
      name: "schedule_proactive_message",
      description: "Schedule a future proactive assistant message. This does not send immediately.",
      parameters: {
        type: "object",
        properties: {
          delaySeconds: { type: "number" },
          topic: { type: "string" },
          reason: { type: "string" },
        },
        required: ["topic", "reason"],
      },
      execute: async (raw) =>
        withTimeout(
          (async () => {
            if (!isExplicitProactiveRequest(input.query)) {
              return {
                scheduled: false,
                reason: "proactive scheduling requires an explicit user request in v1",
              };
            }

            return await createChatProactiveJob({
              chatId: input.chatId,
              sourceTurnTraceId: input.turnTraceId,
              topic: String((raw as { topic?: unknown })?.topic ?? "继续刚才的话题"),
              reason: String((raw as { reason?: unknown })?.reason ?? "planner requested proactive follow-up"),
              delaySeconds: Number((raw as { delaySeconds?: unknown })?.delaySeconds ?? 180),
            });
          })(),
          readPlannerToolTimeoutMs(),
          "schedule_proactive_message timed out",
        ),
    });
  }

  return tools;
};

const isParseErrorLike = (value: unknown): value is {
  name?: string;
  rawResponse?: unknown;
  parsedCandidate?: unknown;
  normalizedCandidate?: unknown;
  message?: string;
} => value instanceof MiniMaxPlannerParseError || (Boolean(value) && typeof value === "object" && (value as { name?: string }).name === "MiniMaxPlannerParseError");

const buildPlannerFailureArtifacts = (input: {
  error: unknown;
}) => {
  if (!isParseErrorLike(input.error)) {
    return [];
  }

  return [
    {
      artifactKey: "planner_raw_response",
      kind: "json" as const,
      value: input.error.rawResponse,
    },
    {
      artifactKey: "planner_parse_error",
      kind: "json" as const,
      value: {
        message: input.error.message ?? "planner parse failed",
        parsedCandidate: input.error.parsedCandidate,
      },
    },
    {
      artifactKey: "planner_normalized_candidate",
      kind: "json" as const,
      value: input.error.normalizedCandidate,
    },
  ];
};

export const runChatPlanner = async (input: {
  chatId: string;
  personaId: string | null;
  personaVersionId: string;
  content: string;
  latestMessageId: string | null;
  latestTurnIndex: number | null;
  turnTraceId: string;
  trace?: PlannerTraceSink;
}) => {
  if (!isChatPlannerEnabled()) {
    return null;
  }

  const startedAt = Date.now();
  const model = readPlannerModel();
  input.trace?.({
    eventName: "chat.planner.request.started",
    stage: "planner",
    status: "started",
    fields: {
      provider: "minimax",
      model,
    },
  });

  try {
    const recentContextPreview = {
      recentTurns: await listRecentChatMessages({
        chatId: input.chatId,
        limit: 4,
        excludeMessageIds: input.latestMessageId ? [input.latestMessageId] : [],
        roles: ["USER", "ASSISTANT"],
      }),
    };
    const abortController = new AbortController();
    const result = await withTimeout(
      runMiniMaxToolLoop({
        apiKey: process.env.MINIMAX_API_KEY,
        baseUrl: process.env.MINIMAX_BASE_URL,
        model,
        systemPrompt: buildPlannerSystemPrompt(),
        userPrompt: buildPlannerUserPrompt({
          content: input.content,
          chatId: input.chatId,
          personaVersionId: input.personaVersionId,
          recentContextPreview,
        }),
        tools: buildPlannerTools({
          chatId: input.chatId,
          personaId: input.personaId,
          personaVersionId: input.personaVersionId,
          query: input.content,
          latestMessageId: input.latestMessageId,
          latestTurnIndex: input.latestTurnIndex,
          turnTraceId: input.turnTraceId,
        }),
        maxToolCalls: 2,
        signal: abortController.signal,
      }),
      readPlannerTimeoutMs(),
      "MiniMax planner timed out",
      () => abortController.abort(),
    );

    const plan: ChatTurnPlan = chatTurnPlanSchema.parse(result.plan);
    input.trace?.({
      eventName: "chat.planner.plan.generated",
      stage: "planner",
      status: "completed",
      durationMs: Date.now() - startedAt,
      fields: {
        provider: "minimax",
        model,
        toolCallCount: result.toolCalls.length,
        shouldSendMultipleMessages: plan.shouldSendMultipleMessages,
        suggestedMessageCount: plan.suggestedMessageCount,
        proactiveShouldSchedule: plan.proactiveCandidate.shouldSchedule,
      },
      artifacts: [
        {
          artifactKey: "planner_tool_calls",
          kind: "json",
          value: result.toolCalls,
        },
        {
          artifactKey: "planner_plan",
          kind: "json",
          value: plan,
        },
        {
          artifactKey: "planner_raw_response",
          kind: "json",
          value: result.rawResponse,
        },
      ],
    });
    return plan;
  } catch (error) {
    input.trace?.({
      eventName: "chat.planner.request.failed",
      stage: "planner",
      status: "failed",
      level: error instanceof MiniMaxPlannerNotConfiguredError ? "warn" : "error",
      durationMs: Date.now() - startedAt,
      fields: {
        provider: "minimax",
        model,
        errorMessage: error instanceof Error ? error.message : "unknown error",
      },
      artifacts: buildPlannerFailureArtifacts({ error }),
    });
    return null;
  }
};

export type { ChatTurnPlan };

export const __internal = {
  buildPlannerSystemPrompt,
  buildPlannerFailureArtifacts,
};
