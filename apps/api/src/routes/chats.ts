import { randomUUID } from "node:crypto";

import {
  chatReplySchema,
  chatSessionSchema,
  createChatMessageSchema,
  createChatSchema,
} from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import { resolvePersonaSeed } from "../seed/official-personae.js";
import { getChatSession, saveChatSession } from "../store/chat-store.js";
import {
  canAccessPersonaVersion,
  getPersonaDetail,
  getPersonaVersion,
  listApprovedSourceEvidence,
  resolveChatTarget,
} from "../store/persona-store.js";
import { getActorSession } from "../utils/actor-session.js";
import { enforceWindowRateLimit } from "../utils/rate-limit.js";
import { runChatWorkflow } from "../workflows/chat/index.js";

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

    return await saveChatSession(session);
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
    const officialSeed = resolvePersonaSeed({
      targetType: session.targetType,
      personaId: session.targetPersonaId ?? undefined,
      personaVersionId: session.targetPersonaVersionId,
      shareSlug: session.shareSlug ?? undefined,
    });

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

    const dynamicVersion = await getPersonaVersion(session.targetPersonaVersionId);
    const dynamicPersona = session.targetPersonaId ? (await getPersonaDetail(session.targetPersonaId))?.persona ?? null : null;
    const rawReply = await runChatWorkflow({
      content: input.content,
      seed: officialSeed,
      dynamicContext:
        officialSeed === null && dynamicVersion
          ? {
              personaVersionId: dynamicVersion.id,
              displayName: dynamicPersona?.displayName ?? "User Persona",
              previewIntro: dynamicVersion.previewIntro,
              profileSummary:
                typeof dynamicVersion.profileJson.summary === "string" ? dynamicVersion.profileJson.summary : null,
              styleExamples: dynamicVersion.sampleAnswers,
              focusKeywords: [
                ...((dynamicVersion.profileJson.topicStrengths as string[] | undefined) ?? []),
                ...dynamicVersion.recommendedQuestions,
                ...dynamicVersion.sampleAnswers,
              ],
              evidence: await listApprovedSourceEvidence(dynamicVersion.personaId),
            }
          : undefined,
    });

    if (!rawReply) {
      return reply.code(404).send({
        message: "Persona reply context not found",
      });
    }

    const replyPayload = chatReplySchema.parse(rawReply);
    const assistantMessage = {
      id: randomUUID(),
      role: "ASSISTANT" as const,
      content: replyPayload.answer,
      basis: replyPayload.basis,
      basisSummary: replyPayload.basisSummary,
      inferenceLevel: replyPayload.inferenceLevel,
      conflictDetected: replyPayload.conflictDetected,
      refusalReason: replyPayload.refusalReason,
      createdAt: new Date().toISOString(),
    };

    session.messages.push(userMessage, assistantMessage);
    await saveChatSession(session);

    return assistantMessage;
  });
};
