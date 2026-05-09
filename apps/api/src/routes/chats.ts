import { randomUUID } from "node:crypto";

import {
  chatSessionSummaryListSchema,
  chatReplySchema,
  chatSessionSchema,
  createChatMessageSchema,
  createChatSchema,
} from "@hall-of-fame/contracts";
import { runKimiResearcher, type WebContext } from "@hall-of-fame/kimi-client";
import type { FastifyPluginAsync } from "fastify";

import { createChatProactiveJob } from "../db/repositories/chat-proactive-repository.js";
import { readChatTraceCaptureLevel } from "../observability/chat-trace/config.js";
import { ChatTraceCollector } from "../observability/chat-trace/collector.js";
import { persistChatTraceRecord } from "../observability/chat-trace/repository.js";
import { resolvePersonaSeed } from "../seed/official-personae.js";
import {
  appendChatMessages,
  getChatSessionAccess,
  getChatSession,
  listChatSessionSummariesByCreator,
  saveChatSession,
} from "../store/chat-store.js";
import { assembleChatContext } from "../services/chat-memory/assemble-chat-context.js";
import { enqueueChatMessageEmbedding } from "../services/embeddings/chat-message-embedding-scheduler.js";
import { runUserMemoryFactExtractionJob } from "../services/memory/user-memory-fact-extractor.js";
import {
  buildPlannerRuntimeContext,
  isChatProactiveEnabled,
  isExplicitProactiveRequest,
  runChatPlanner,
} from "../services/minimax-planner/chat-planner.js";
import {
  buildRequestedPlannerTools,
  buildToolExecutionTrace,
  type ProactiveTraceOutcome,
} from "../services/minimax-planner/tool-plan-trace.js";
import { normalizeResearchPlan } from "../services/research/research-plan.js";
import { sanitizeWebContext } from "../services/research/web-context-sanitizer.js";
import { chatRealtimeHub } from "../services/realtime/realtime-hub.js";
import { isChatRealtimeEnabled } from "../services/realtime/realtime-pg-listener.js";
import {
  canAccessPersonaVersion,
  getPersonaDetail,
  getPersonaVersion,
  listApprovedSourceEvidence,
  resolveChatTarget,
} from "../store/persona-store.js";
import { requireActorSession } from "../utils/actor-session.js";
import { enforceWindowRateLimit } from "../utils/rate-limit.js";
import { readChatMaxTokens, runChatWorkflow } from "../workflows/chat/index.js";
import { routeChatTurn } from "../workflows/chat/turn-router.js";

const previewText = (value: string, limit = 200) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}...`;
};

const splitAssistantAnswer = (answer: string, suggestedCount: number) => {
  const count = Math.min(Math.max(suggestedCount, 1), 3);
  if (count <= 1) {
    return [answer];
  }

  const paragraphs = answer
    .split(/\n+/u)
    .map((item) => item.trim())
    .filter(Boolean);
  if (paragraphs.length >= count) {
    return paragraphs.slice(0, count - 1).concat(paragraphs.slice(count - 1).join("\n"));
  }

  const sentences = answer
    .split(/(?<=[。！？!?])\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);
  if (sentences.length >= count) {
    return sentences.slice(0, count - 1).concat(sentences.slice(count - 1).join(""));
  }

  return [answer];
};

const toPublicChatMessage = <T extends object>(message: T): Omit<T, "messageMetadata"> => {
  const { messageMetadata: _messageMetadata, ...publicMessage } = message as T & { messageMetadata?: unknown };
  return publicMessage;
};

const isKimiWebSearchEnabled = () => process.env.KIMI_WEB_SEARCH_ENABLED === "true";
export const CHAT_WEB_CONTEXT_UNAVAILABLE_COPY = "未能获取可靠的最新联网资料，不能编造最新事实。";

export class ChatKimiResearchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`chat_kimi_research_timeout:${timeoutMs}`);
    this.name = "ChatKimiResearchTimeoutError";
  }
}

export const readChatKimiResearchTimeoutMs = () => {
  const rawValue = process.env.CHAT_KIMI_RESEARCH_TIMEOUT_MS;
  if (!rawValue?.trim()) {
    return 30_000;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30_000;
  }

  return Math.max(1_000, Math.floor(parsed));
};

type ChatKimiResearcher = typeof runKimiResearcher;

export const runKimiResearcherWithTimeout = async (
  input: Parameters<ChatKimiResearcher>[0],
  deps: {
    researcher?: ChatKimiResearcher;
    timeoutMs?: number;
  } = {},
) => {
  const researcher = deps.researcher ?? runKimiResearcher;
  const timeoutMs = deps.timeoutMs ?? readChatKimiResearchTimeoutMs();
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      researcher(input, { signal: controller.signal }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new ChatKimiResearchTimeoutError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const readPlannerModelForMetadata = (decisionSource?: "fast_planner" | "minimax" | "fallback") => {
  if (decisionSource === "minimax") {
    return process.env.MINIMAX_PLANNER_MODEL ?? "MiniMax-M2.7";
  }
  if (decisionSource === "fast_planner") {
    const provider = (process.env.CHAT_FAST_PLANNER_PROVIDER ?? process.env.CHAT_PLANNER_PROVIDER ?? "deepseek")
      .trim()
      .toLowerCase();
    if (provider === "kimi") {
      return process.env.CHAT_FAST_PLANNER_MODEL ?? process.env.KIMI_MODEL ?? "kimi-k2.6";
    }
    return process.env.CHAT_FAST_PLANNER_MODEL ?? process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-v4-flash";
  }
  return undefined;
};

const unavailableWebContext = (input: {
  query: string;
  uncertainty: string;
}): WebContext => ({
  query: input.query,
  freshnessStatus: "uncertain",
  keyFindings: [],
  sources: [],
  uncertainty: input.uncertainty,
});

export const chatsRoute: FastifyPluginAsync = async (app) => {
  app.post("/v1/chats", async (request, reply) => {
    const input = createChatSchema.parse(request.body);
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return;
    }

    const resolved = await resolveChatTarget(input);

    if (!resolved) {
      return reply.code(404).send({
        message: "Chat target not found",
      });
    }

    if (
      input.targetType === "draft_version_preview" &&
      !(await canAccessPersonaVersion(resolved.personaVersionId, actor.userId, actor.role))
    ) {
      return reply.code(403).send({
        message: "You do not have access to this preview version",
      });
    }

    const session = chatSessionSchema.parse({
      id: randomUUID(),
      targetType: input.targetType,
      targetPersonaId: resolved.kind === "official" ? null : resolved.personaId,
      targetPersonaVersionId: resolved.personaVersionId,
      shareSlug: resolved.shareSlug,
      messages: [],
    });

    return await saveChatSession(session, {
      createdByUserId: actor.userId,
    });
  });

  app.get("/v1/chats", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return;
    }

    const items = await listChatSessionSummariesByCreator({
      createdByUserId: actor.userId,
      limit: 50,
    });

    return chatSessionSummaryListSchema.parse({
      items: items.map((item) => {
        const officialSeed = resolvePersonaSeed({
          targetType: item.targetType,
          personaId: item.targetPersonaId ?? undefined,
          personaVersionId: item.targetPersonaVersionId,
          shareSlug: item.shareSlug ?? undefined,
        });

        return {
          id: item.chatId,
          targetType: item.targetType,
          resumePersonaId:
            item.targetType === "published_persona" ? (item.targetPersonaId ?? officialSeed?.persona.id ?? null) : null,
          targetPersonaVersionId: item.targetPersonaVersionId,
          ownedObjectId: item.ownedObjectId,
          shareSlug: item.shareSlug,
          displayName: item.dynamicDisplayName ?? officialSeed?.persona.displayName ?? "对象",
          latestMessage: item.latestMessage,
          updatedAt: item.updatedAt,
        };
      }),
    });
  });

  app.get<{ Params: { chatId: string } }>("/v1/chats/:chatId", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return;
    }

    const access = await getChatSessionAccess(request.params.chatId);
    if (!access || access.createdByUserId !== actor.userId) {
      return reply.code(404).send({
        message: "Chat not found",
      });
    }

    const session = await getChatSession(request.params.chatId);

    if (!session) {
      return reply.code(404).send({
        message: "Chat not found",
      });
    }

    return session;
  });

  app.post<{ Params: { chatId: string } }>("/v1/chats/:chatId/messages", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return;
    }

    const access = await getChatSessionAccess(request.params.chatId);
    if (!access || access.createdByUserId !== actor.userId) {
      return reply.code(404).send({
        message: "Chat not found",
      });
    }
    if (!access.canAppendMessages) {
      return reply.code(409).send({
        message: "这个对象已不能继续聊天。",
      });
    }

    const limit = enforceWindowRateLimit({
      key: `chat:${request.ip || "unknown"}`,
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.allowed) {
      return reply.code(429).send({
        message: "Too many chat messages, please retry later.",
        retryAfterMs: limit.retryAfterMs,
      });
    }

    const session = await getChatSession(request.params.chatId);

    if (!session) {
      return reply.code(404).send({
        message: "Chat not found",
      });
    }

    const input = createChatMessageSchema.parse(request.body);
    const turnTraceId = `turn_${randomUUID()}`;
    const collector = new ChatTraceCollector({
      logger: request.log,
      turnTraceId,
      requestId: request.id,
      chatId: session.id,
      userId: actor?.userId ?? null,
      personaId: session.targetPersonaId,
      personaVersionId: session.targetPersonaVersionId,
      captureLevel: readChatTraceCaptureLevel(),
      modelProvider: "deepseek",
      modelName: process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat",
      temperature: Number(process.env.DEEPSEEK_CHAT_TEMPERATURE ?? "0.8"),
      maxTokens: readChatMaxTokens(),
    });
    reply.header("x-turn-trace-id", turnTraceId);
    collector.recordEvent({
      eventName: "chat.turn.received",
      stage: "turn",
      status: "received",
      fields: {
        contentPreview: previewText(input.content),
        clientIp: request.ip ?? null,
      },
    });

    const persistCollector = async () => {
      try {
        await persistChatTraceRecord(collector.toRecordInput());
      } catch (error) {
        request.log.warn(
          {
            kind: "chat_trace_degraded",
            turnTraceId,
            chatId: session.id,
            errorMessage: error instanceof Error ? error.message : "unknown error",
          },
          "[chat-trace] persistence degraded",
        );
      }
    };

    const officialSeed = resolvePersonaSeed({
      targetType: session.targetType,
      personaId: session.targetPersonaId ?? undefined,
      personaVersionId: session.targetPersonaVersionId,
      shareSlug: session.shareSlug ?? undefined,
    });

    const failTurn = async (error: unknown) => {
      const message = error instanceof Error ? error.message : "unknown error";
      collector.setErrorMessage(message);
      collector.recordEvent({
        eventName: "chat.turn.failed",
        stage: "turn",
        status: "failed",
        level: "error",
        fields: {
          errorMessage: message,
        },
      });
      if (isChatRealtimeEnabled()) {
        chatRealtimeHub.publish({
          type: "chat.turn.failed",
          chatId: session.id,
          turnTraceId,
          message,
        });
      }
      collector.finalize("failed");
      await persistCollector();
    };

    try {
      const userMessage = {
        id: randomUUID(),
        role: "USER" as const,
        content: input.content,
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
      };
      const [persistedUserMessage] = await appendChatMessages(session.id, [userMessage]);
      collector.setMessageId(persistedUserMessage?.messageId ?? userMessage.id);
      if (persistedUserMessage) {
        enqueueChatMessageEmbedding(
          {
            chatId: session.id,
            messageId: persistedUserMessage.messageId,
            role: persistedUserMessage.role,
            content: persistedUserMessage.content,
            turnIndex: persistedUserMessage.turnIndex,
          },
          {
            logger: request.log,
          },
        );
        void runUserMemoryFactExtractionJob({
          chatId: session.id,
          sourceMessageId: persistedUserMessage.messageId,
          content: persistedUserMessage.content,
        }).catch((error) => {
          request.log.warn(
            {
              kind: "user_memory_fact_extraction_failed",
              chatId: session.id,
              messageId: persistedUserMessage.messageId,
              errorMessage: error instanceof Error ? error.message : "unknown error",
            },
            "[memory] user memory fact extraction failed",
          );
        });
      }
      collector.recordEvent({
        eventName: "chat.turn.persisted_user_message",
        stage: "turn",
        status: "completed",
        fields: {
          messageId: persistedUserMessage?.messageId ?? userMessage.id,
          turnIndex: persistedUserMessage?.turnIndex ?? null,
        },
      });

      const processAssistantReply = async () => {
        const dynamicVersion = await getPersonaVersion(session.targetPersonaVersionId);
        const dynamicPersona = session.targetPersonaId ? (await getPersonaDetail(session.targetPersonaId))?.persona ?? null : null;
        const personaEvidence =
          officialSeed === null && dynamicVersion ? await listApprovedSourceEvidence(dynamicVersion.personaId) : [];
        const focusKeywords = officialSeed
          ? [
              ...officialSeed.replyKeywords,
              ...((officialSeed.version.profileJson.topicStrengths as string[] | undefined) ?? []),
              ...officialSeed.version.recommendedQuestions,
              ...officialSeed.version.sampleAnswers,
            ]
          : dynamicVersion
            ? [
                ...((dynamicVersion.profileJson.topicStrengths as string[] | undefined) ?? []),
                ...dynamicVersion.recommendedQuestions,
                ...dynamicVersion.sampleAnswers,
              ]
            : [];
        const fallbackRouting = routeChatTurn({
          content: input.content,
          focusKeywords,
        });
        const plannerPersonaContext = {
          displayName:
            dynamicPersona?.displayName ??
            officialSeed?.persona.displayName ??
            "User Persona",
          previewIntro: dynamicVersion?.previewIntro ?? officialSeed?.version.previewIntro ?? null,
          profileSummary:
            typeof dynamicVersion?.profileJson.summary === "string"
              ? dynamicVersion.profileJson.summary
              : officialSeed?.version.profileJson.summary && typeof officialSeed.version.profileJson.summary === "string"
                ? officialSeed.version.profileJson.summary
                : null,
        };
        const plannerRuntimeContext = buildPlannerRuntimeContext();
        const rawTurnPlan = await runChatPlanner({
          chatId: session.id,
          personaId: session.targetPersonaId,
          personaVersionId: session.targetPersonaVersionId,
          personaContext: plannerPersonaContext,
          runtimeContext: plannerRuntimeContext,
          content: input.content,
          latestMessageId: persistedUserMessage?.messageId ?? userMessage.id,
          latestTurnIndex: persistedUserMessage?.turnIndex ?? null,
          turnTraceId,
          fallbackReplyMode: fallbackRouting.replyMode,
          fallbackPersonaIntensity: fallbackRouting.personaIntensity,
          trace: (event) => {
            const artifactRefs = (event.artifacts ?? []).map((artifact) =>
              artifact.kind === "text"
                ? collector.addTextArtifact(artifact.artifactKey, artifact.value, artifact.contentType)
                : collector.addJsonArtifact(artifact.artifactKey, artifact.value, artifact.contentType),
            );
            collector.recordEvent({
              eventName: event.eventName,
              stage: event.stage,
              status: event.status,
              level: event.level,
              durationMs: event.durationMs,
              fields: event.fields,
              artifactRefs,
            });
          },
        });
        const turnPlan = rawTurnPlan?.needWebSearch
          ? (() => {
              const normalized = normalizeResearchPlan({
                needWebSearch: rawTurnPlan.needWebSearch,
                webSearchQuery: rawTurnPlan.webSearchQuery,
                researchPlan: rawTurnPlan.researchPlan,
                personaContext: plannerPersonaContext,
                runtimeContext: plannerRuntimeContext,
                userMessage: input.content,
              });
              const normalizedPlan = {
                ...rawTurnPlan,
                webSearchQuery: normalized.webSearchQuery,
                researchPlan: normalized.researchPlan,
                retrievalHints: {
                  ...rawTurnPlan.retrievalHints,
                  focusQueries: [
                    ...new Set([
                      ...(normalized.researchPlan?.searchQueries ?? []),
                      ...rawTurnPlan.retrievalHints.focusQueries,
                    ]),
                  ],
                },
              };
              const artifactRef = collector.addJsonArtifact("research_plan_normalized", normalized.researchPlan);
              collector.recordEvent({
                eventName: "chat.research_plan.normalized",
                stage: "planner",
                status: "completed",
                fields: {
                  subject: normalized.researchPlan?.subject ?? null,
                  searchQueries: normalized.researchPlan?.searchQueries ?? [],
                  timeWindow: normalized.researchPlan?.timeWindow ?? null,
                  asOf: normalized.researchPlan?.asOf ?? null,
                  webSearchQuery: normalized.webSearchQuery,
                },
                artifactRefs: [artifactRef],
              });
              return normalizedPlan;
            })()
          : rawTurnPlan;
        const requestedTools = turnPlan ? buildRequestedPlannerTools(turnPlan) : [];
        const turnPlanArtifactRefs = [
          ...(rawTurnPlan
            ? [collector.addJsonArtifact("turn_plan_before_research_normalization", rawTurnPlan)]
            : []),
          ...(turnPlan ? [collector.addJsonArtifact("turn_plan_after_research_normalization", turnPlan)] : []),
        ];
        collector.recordEvent({
          eventName: "chat.tool_plan.finalized",
          stage: "planner",
          status: "completed",
          fields: {
            plannerDecisionSource: turnPlan?.decisionSource ?? null,
            fallbackUsed: turnPlan?.decisionSource === "fallback",
            requestedTools,
            needChatMemory: turnPlan?.needChatMemory ?? null,
            needPersonaKnowledge: turnPlan?.needPersonaKnowledge ?? null,
            needWebSearch: turnPlan?.needWebSearch ?? null,
            webSearchQuery: turnPlan?.webSearchQuery ?? null,
            answerMode: turnPlan?.answerMode ?? null,
          },
          artifactRefs: turnPlanArtifactRefs,
        });
        const turnRouting = turnPlan
          ? {
              replyMode: turnPlan.replyMode,
              personaIntensity: turnPlan.personaIntensity,
            }
          : fallbackRouting;
        collector.recordEvent({
          eventName: "chat.turn.routed",
          stage: "routing",
          status: "completed",
          fields: {
            replyMode: turnRouting.replyMode,
            personaIntensity: turnRouting.personaIntensity,
            fallbackReplyMode: fallbackRouting.replyMode,
            fallbackPersonaIntensity: fallbackRouting.personaIntensity,
            plannerUsed: turnPlan ? turnPlan.decisionSource !== "fallback" : false,
            plannerDecisionSource: turnPlan?.decisionSource ?? null,
            plannerToolPolicy: "decision_only",
          },
        });

        let proactiveOutcome: ProactiveTraceOutcome = "not_requested";
        if (turnPlan?.proactiveCandidate.shouldSchedule) {
          if (!isChatProactiveEnabled()) {
            proactiveOutcome = "skipped_disabled";
            collector.recordEvent({
              eventName: "chat.proactive.job.skipped",
              stage: "proactive",
              status: "skipped",
              level: "warn",
              fields: {
                reason: "disabled",
              },
            });
          } else if (!isExplicitProactiveRequest(input.content)) {
            proactiveOutcome = "skipped_not_explicit";
            collector.recordEvent({
              eventName: "chat.proactive.job.skipped",
              stage: "proactive",
              status: "skipped",
              level: "warn",
              fields: {
                reason: "requires_explicit_user_request",
                plannerReason: turnPlan.proactiveCandidate.reason,
              },
            });
          } else {
            try {
              const job = await createChatProactiveJob({
                chatId: session.id,
                sourceTurnTraceId: turnTraceId,
                topic: turnPlan.proactiveCandidate.topic ?? "继续刚才的话题",
                reason: turnPlan.proactiveCandidate.reason ?? "planner requested proactive follow-up",
                delaySeconds: turnPlan.proactiveCandidate.delaySeconds ?? 180,
              });
              collector.recordEvent({
                eventName: "chat.proactive.job.created",
                stage: "proactive",
                status: "completed",
                fields: {
                  jobId: job.id,
                  dueAt: job.dueAt,
                  delaySeconds: turnPlan.proactiveCandidate.delaySeconds ?? 180,
                },
              });
            } catch (error) {
              proactiveOutcome = "failed";
              collector.recordEvent({
                eventName: "chat.proactive.job.failed",
                stage: "proactive",
                status: "failed",
                level: "warn",
                fields: {
                  errorMessage: error instanceof Error ? error.message : "unknown error",
                },
              });
            }
            if (proactiveOutcome !== "failed") {
              proactiveOutcome = "created";
            }
          }
        }

        const chatContext = await assembleChatContext({
          chatId: session.id,
          personaId: session.targetPersonaId,
          personaVersionId: session.targetPersonaVersionId,
          query: input.content,
          latestMessageId: persistedUserMessage?.messageId ?? userMessage.id,
          latestTurnIndex: persistedUserMessage?.turnIndex ?? null,
          includeChatMemory: turnPlan?.needChatMemory ?? true,
          includePersonaKnowledge: turnPlan?.needPersonaKnowledge ?? true,
          personaEvidence,
        });
        collector.recordEvent({
          eventName: "chat.memory.search.completed",
          stage: "memory",
          status: "completed",
          fields: {
            requestId: chatContext.diagnostics.memorySearch.requestId,
            totalHits: chatContext.diagnostics.memorySearch.totalHits,
            returnedHits: chatContext.diagnostics.memorySearch.returnedHits,
            truncated: chatContext.diagnostics.memorySearch.truncated,
            retrievalMode: chatContext.diagnostics.memorySearch.retrievalMode,
            topHits: chatContext.diagnostics.memorySearch.topHits,
            vectorSearch: chatContext.diagnostics.vectorSearch,
            retrievalPlan: chatContext.diagnostics.retrievalPlan,
          },
        });
        const chatContextArtifact = collector.addJsonArtifact("chat_context", {
          recentTurns: chatContext.recentTurns,
          retrievedMemories: chatContext.retrievedMemories,
          userFacts: chatContext.userFacts,
          personaChunks: chatContext.personaChunks,
          personaEvidence: chatContext.personaEvidence,
        });
        collector.recordEvent({
          eventName: "chat.context.assembled",
          stage: "context",
          status: "completed",
          fields: {
            recentTurnsCount: chatContext.recentTurns.length,
            retrievedMemoriesCount: chatContext.retrievedMemories.length,
            userFactsCount: chatContext.userFacts.length,
            personaChunksCount: chatContext.personaChunks.length,
            personaEvidenceCount: chatContext.personaEvidence.length,
            contextBudget: chatContext.diagnostics.contextBudget,
            vectorSearch: chatContext.diagnostics.vectorSearch,
            retrievalPlan: chatContext.diagnostics.retrievalPlan,
          },
          artifactRefs: [chatContextArtifact],
        });
        let webContext: WebContext | null = null;
        let webSearchAttempted = false;
        let webSearchResultUsed = false;
        let webSearchFreshnessStatus: string | null = null;
        let webSearchSourceCount = 0;
        if (turnPlan?.needWebSearch) {
          webSearchAttempted = true;
          const researchPlan = turnPlan.researchPlan;
          const webSearchQuery = researchPlan?.searchQueries[0] ?? turnPlan.webSearchQuery ?? input.content;
          let rawWebContext: WebContext;
          if (!isKimiWebSearchEnabled()) {
            rawWebContext = unavailableWebContext({
              query: webSearchQuery,
              uncertainty: CHAT_WEB_CONTEXT_UNAVAILABLE_COPY,
            });
            collector.recordEvent({
              eventName: "chat.kimi.research.skipped",
              stage: "kimi",
              status: "skipped",
              level: "warn",
              fields: {
                reason: "disabled",
                query: webSearchQuery,
              },
            });
          } else {
            const kimiStartedAt = Date.now();
            const kimiTimeoutMs = readChatKimiResearchTimeoutMs();
            collector.recordEvent({
              eventName: "chat.kimi.research.started",
              stage: "kimi",
              status: "started",
              fields: {
                model: process.env.KIMI_MODEL ?? "kimi-k2.6",
                query: webSearchQuery,
                searchQueries: researchPlan?.searchQueries ?? [webSearchQuery],
                researchSubject: researchPlan?.subject ?? null,
                plannerReason: turnPlan.webSearchReason ?? null,
                timeoutMs: kimiTimeoutMs,
              },
            });
            try {
              rawWebContext = await runKimiResearcherWithTimeout(
                {
                  userMessage: input.content,
                  webSearchQuery: researchPlan ? undefined : webSearchQuery,
                  researchPlan: researchPlan ?? undefined,
                  plannerReason: turnPlan.webSearchReason ?? "planner requested fresh information",
                  locale: "zh-CN",
                  maxFindings: 5,
                },
                {
                  timeoutMs: kimiTimeoutMs,
                },
              );
              const webContextArtifact = collector.addJsonArtifact("kimi_web_context_raw", rawWebContext);
              collector.recordEvent({
                eventName: "chat.kimi.research.completed",
                stage: "kimi",
                status: "completed",
                durationMs: Date.now() - kimiStartedAt,
                fields: {
                  query: rawWebContext.query,
                  freshnessStatus: rawWebContext.freshnessStatus,
                  findingCount: rawWebContext.keyFindings.length,
                  sourceCount: rawWebContext.sources.length,
                  timeoutMs: kimiTimeoutMs,
                },
                artifactRefs: [webContextArtifact],
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : "unknown error";
              const timedOut = error instanceof ChatKimiResearchTimeoutError;
              rawWebContext = unavailableWebContext({
                query: webSearchQuery,
                uncertainty: CHAT_WEB_CONTEXT_UNAVAILABLE_COPY,
              });
              collector.recordEvent({
                eventName: "chat.kimi.research.failed",
                stage: "kimi",
                status: "failed",
                level: "warn",
                durationMs: Date.now() - kimiStartedAt,
                fields: {
                  query: webSearchQuery,
                  errorMessage: message,
                  timedOut,
                  timeoutMs: kimiTimeoutMs,
                },
              });
            }
          }
          const sanitized = sanitizeWebContext({
            webContext: rawWebContext,
            researchPlan,
          });
          webContext = sanitized.webContext;
          webSearchResultUsed = sanitized.used;
          webSearchFreshnessStatus = sanitized.webContext.freshnessStatus;
          webSearchSourceCount = sanitized.webContext.sources.length;
          const sanitizedArtifact = collector.addJsonArtifact("kimi_web_context_sanitized", sanitized.webContext);
          collector.recordEvent({
            eventName: "chat.kimi.web_context.sanitized",
            stage: "kimi",
            status: "completed",
            fields: {
              webSearchRequested: true,
              webSearchResultUsed: sanitized.used,
              webSearchFreshnessStatus: sanitized.webContext.freshnessStatus,
              webSearchSourceCount: sanitized.webContext.sources.length,
              webSearchQueryOriginal: turnPlan.webSearchQuery ?? null,
              webSearchQueriesResolved: researchPlan?.searchQueries ?? [webSearchQuery],
            },
            artifactRefs: [sanitizedArtifact],
          });
        }
        collector.recordEvent({
          eventName: "chat.tools.execution.completed",
          stage: "context",
          status: "completed",
          fields: buildToolExecutionTrace({
            requestedTools,
            chatMemoryRequested: turnPlan?.needChatMemory ?? true,
            chatMemoryReturnedCount: chatContext.retrievedMemories.length,
            personaKnowledgeRequested: turnPlan?.needPersonaKnowledge ?? true,
            personaKnowledgeReturnedCount: chatContext.personaChunks.length + chatContext.personaEvidence.length,
            webSearchRequested: turnPlan?.needWebSearch ?? false,
            webSearchAttempted,
            webSearchResultUsed,
            webSearchFreshnessStatus,
            webSearchSourceCount,
            proactiveRequested: turnPlan?.proactiveCandidate.shouldSchedule ?? false,
            proactiveOutcome,
          }),
        });

        const rawReply = await runChatWorkflow(
          {
            content: input.content,
            seed: officialSeed,
            chatContext,
            turnPlan,
            webContext,
            turnRouting,
            dynamicContext:
              officialSeed === null && dynamicVersion
                ? {
                    personaVersionId: dynamicVersion.id,
                    displayName: dynamicPersona?.displayName ?? "User Persona",
                    previewIntro: dynamicVersion.previewIntro,
                    profileSummary:
                      typeof dynamicVersion.profileJson.summary === "string" ? dynamicVersion.profileJson.summary : null,
                    styleExamples: dynamicVersion.sampleAnswers,
                    focusKeywords: [...focusKeywords],
                    evidence: personaEvidence,
                  }
                : undefined,
          },
          {
            trace: (event) => {
              if (event.eventName === "chat.workflow.fallback.used") {
                collector.markFallbackUsed();
              }
              const artifactRefs = (event.artifacts ?? []).map((artifact) =>
                artifact.kind === "text"
                  ? collector.addTextArtifact(artifact.artifactKey, artifact.value, artifact.contentType)
                  : collector.addJsonArtifact(artifact.artifactKey, artifact.value, artifact.contentType),
              );
              collector.recordEvent({
                eventName: event.eventName,
                stage: event.stage,
                status: event.status,
                level: event.level,
                durationMs: event.durationMs,
                fields: event.fields,
                artifactRefs,
              });
            },
          },
        );

        if (!rawReply) {
          collector.setErrorMessage("Persona reply context not found");
          collector.recordEvent({
            eventName: "chat.turn.failed",
            stage: "turn",
            status: "failed",
            level: "error",
            fields: {
              errorMessage: "Persona reply context not found",
            },
          });
          collector.finalize("failed");
          await persistCollector();
          if (isChatRealtimeEnabled()) {
            chatRealtimeHub.publish({
              type: "chat.turn.failed",
              chatId: session.id,
              turnTraceId,
              message: "Persona reply context not found",
            });
            return null;
          }
          return reply.code(404).send({
            message: "Persona reply context not found",
          });
        }

        const replyPayload = chatReplySchema.parse(rawReply);
        const answerParts = splitAssistantAnswer(
          replyPayload.answer,
          turnPlan?.shouldSendMultipleMessages ? turnPlan.suggestedMessageCount : 1,
        );
        const assistantMessages = answerParts.map((content, index) => ({
          id: randomUUID(),
          role: "ASSISTANT" as const,
          content,
          basis: replyPayload.basis,
          basisSummary: replyPayload.basisSummary,
          inferenceLevel: replyPayload.inferenceLevel,
          conflictDetected: replyPayload.conflictDetected,
          refusalReason: replyPayload.refusalReason,
          createdAt: new Date().toISOString(),
          messageMetadata: {
            turnTraceId,
            source: "reply" as const,
            sequence: index + 1,
            plannerModel: readPlannerModelForMetadata(turnPlan?.decisionSource),
            responderModel: process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat",
          },
        }));
        const persistedAssistantMessages = await appendChatMessages(session.id, assistantMessages);
        for (const message of persistedAssistantMessages) {
          enqueueChatMessageEmbedding(
            {
              chatId: session.id,
              messageId: message.messageId,
              role: message.role,
              content: message.content,
              turnIndex: message.turnIndex,
            },
            {
              logger: request.log,
            },
          );
        }
        const firstAssistantMessage = assistantMessages[0]!;
        collector.setAssistantMessageId(firstAssistantMessage.id);
        const assistantArtifact = collector.addJsonArtifact("final_assistant_message", {
          messages: assistantMessages,
        });
        collector.recordEvent({
          eventName: "chat.turn.persisted_assistant_messages",
          stage: "turn",
          status: "completed",
          fields: {
            assistantMessageId: firstAssistantMessage.id,
            assistantMessageIds: assistantMessages.map((message) => message.id),
            messageCount: assistantMessages.length,
            answerPreview: previewText(firstAssistantMessage.content),
          },
          artifactRefs: [assistantArtifact],
        });
        for (const message of assistantMessages) {
          if (isChatRealtimeEnabled()) {
            chatRealtimeHub.publish({
              type: "chat.message.created",
              chatId: session.id,
              message: toPublicChatMessage(message),
            });
          }
        }
        collector.recordEvent({
          eventName: "chat.turn.completed",
          stage: "turn",
          status: collector.toRecordInput().trace.fallbackUsed ? "fallback_success" : "success",
          fields: {
            assistantMessageId: firstAssistantMessage.id,
            assistantMessageIds: assistantMessages.map((message) => message.id),
            refusalReason: firstAssistantMessage.refusalReason,
            inferenceLevel: firstAssistantMessage.inferenceLevel,
          },
        });
        if (isChatRealtimeEnabled()) {
          chatRealtimeHub.publish({
            type: "chat.turn.completed",
            chatId: session.id,
            turnTraceId,
          });
        }
        collector.finalize(collector.toRecordInput().trace.fallbackUsed ? "fallback_success" : "success");
        await persistCollector();

        return toPublicChatMessage(firstAssistantMessage);
      };

      if (isChatRealtimeEnabled()) {
        void processAssistantReply().catch(async (error) => {
          request.log.error(
            {
              kind: "chat_turn_background_failed",
              turnTraceId,
              chatId: session.id,
              errorMessage: error instanceof Error ? error.message : "unknown error",
            },
            "background chat turn failed",
          );
          await failTurn(error);
        });

        return reply.code(202).send({
          status: "accepted",
          turnTraceId,
          message: toPublicChatMessage(userMessage),
        });
      }

      return await processAssistantReply();
    } catch (error) {
      await failTurn(error);
      throw error;
    }
  });
};
