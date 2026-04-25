import { randomUUID } from "node:crypto";

import {
  chatSessionSummaryListSchema,
  chatReplySchema,
  chatSessionSchema,
  createChatMessageSchema,
  createChatSchema,
} from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import { readChatTraceCaptureLevel } from "../observability/chat-trace/config.js";
import { ChatTraceCollector } from "../observability/chat-trace/collector.js";
import { persistChatTraceRecord } from "../observability/chat-trace/repository.js";
import { resolvePersonaSeed } from "../seed/official-personae.js";
import {
  appendChatMessages,
  getChatSession,
  listChatSessionSummariesByCreator,
  saveChatSession,
} from "../store/chat-store.js";
import { assembleChatContext } from "../services/chat-memory/assemble-chat-context.js";
import { runChatPlanner } from "../services/minimax-planner/chat-planner.js";
import { chatRealtimeHub } from "../services/realtime/realtime-hub.js";
import { isChatRealtimeEnabled } from "../services/realtime/realtime-pg-listener.js";
import {
  canAccessPersonaVersion,
  getPersonaDetail,
  getPersonaVersion,
  listApprovedSourceEvidence,
  resolveChatTarget,
} from "../store/persona-store.js";
import { getActorSession, requireActorSession } from "../utils/actor-session.js";
import { enforceWindowRateLimit } from "../utils/rate-limit.js";
import { runChatWorkflow } from "../workflows/chat/index.js";
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

export const chatsRoute: FastifyPluginAsync = async (app) => {
  app.post("/v1/chats", async (request, reply) => {
    const input = createChatSchema.parse(request.body);
    const resolved = await resolveChatTarget(input);

    if (!resolved) {
      return reply.code(404).send({
        message: "Chat target not found",
      });
    }

    const actor = getActorSession(request);
    if (
      input.targetType === "draft_version_preview" &&
      !(await canAccessPersonaVersion(resolved.personaVersionId, actor?.userId ?? null, actor?.role ?? null))
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
      createdByUserId: actor?.userId ?? null,
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
          shareSlug: item.shareSlug,
          displayName: item.dynamicDisplayName ?? officialSeed?.persona.displayName ?? "对象",
          latestMessage: item.latestMessage,
          updatedAt: item.updatedAt,
        };
      }),
    });
  });

  app.get<{ Params: { chatId: string } }>("/v1/chats/:chatId", async (request, reply) => {
    const session = await getChatSession(request.params.chatId);

    if (!session) {
      return reply.code(404).send({
        message: "Chat not found",
      });
    }

    return session;
  });

  app.post<{ Params: { chatId: string } }>("/v1/chats/:chatId/messages", async (request, reply) => {
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
    const actor = getActorSession(request);
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
      maxTokens: 700,
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
        const turnRouting = routeChatTurn({
          content: input.content,
          focusKeywords,
        });
        collector.recordEvent({
          eventName: "chat.turn.routed",
          stage: "routing",
          status: "completed",
          fields: {
            replyMode: turnRouting.replyMode,
            personaIntensity: turnRouting.personaIntensity,
            plannerToolPolicy: "model_decides",
          },
        });
        const chatContext = await assembleChatContext({
          chatId: session.id,
          personaId: session.targetPersonaId,
          personaVersionId: session.targetPersonaVersionId,
          query: input.content,
          latestMessageId: persistedUserMessage?.messageId ?? userMessage.id,
          latestTurnIndex: persistedUserMessage?.turnIndex ?? null,
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
          },
        });
        const chatContextArtifact = collector.addJsonArtifact("chat_context", {
          recentTurns: chatContext.recentTurns,
          retrievedMemories: chatContext.retrievedMemories,
          personaEvidence: chatContext.personaEvidence,
        });
        collector.recordEvent({
          eventName: "chat.context.assembled",
          stage: "context",
          status: "completed",
          fields: {
            recentTurnsCount: chatContext.recentTurns.length,
            retrievedMemoriesCount: chatContext.retrievedMemories.length,
            personaEvidenceCount: chatContext.personaEvidence.length,
            contextBudget: chatContext.diagnostics.contextBudget,
          },
          artifactRefs: [chatContextArtifact],
        });

        const turnPlan = await runChatPlanner({
          chatId: session.id,
          personaId: session.targetPersonaId,
          personaVersionId: session.targetPersonaVersionId,
          content: input.content,
          latestMessageId: persistedUserMessage?.messageId ?? userMessage.id,
          latestTurnIndex: persistedUserMessage?.turnIndex ?? null,
          turnTraceId,
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

        const rawReply = await runChatWorkflow(
          {
            content: input.content,
            seed: officialSeed,
            chatContext,
            turnPlan,
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
            plannerModel: turnPlan ? (process.env.MINIMAX_PLANNER_MODEL ?? "MiniMax-M2.7") : undefined,
            responderModel: process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat",
          },
        }));
        await appendChatMessages(session.id, assistantMessages);
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
