import { randomUUID } from "node:crypto";

import {
  chatReplySchema,
  chatSessionSchema,
  createChatMessageSchema,
  createChatSchema,
} from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import { createSeedReply, resolvePersonaSeed } from "../seed/official-personae.js";
import { getChatSession, saveChatSession } from "../store/chat-store.js";

export const chatsRoute: FastifyPluginAsync = async (app) => {
  app.post("/v1/chats", async (request, reply) => {
    const input = createChatSchema.parse(request.body);
    const seed = resolvePersonaSeed(input);

    if (!seed) {
      return reply.code(404).send({
        message: "Chat target not found",
      });
    }

    const session = chatSessionSchema.parse({
      id: randomUUID(),
      targetType: input.targetType,
      targetPersonaId: seed.persona.id,
      targetPersonaVersionId: seed.version.id,
      shareSlug: input.targetType === "share_link" ? input.shareSlug : null,
      messages: [],
    });

    saveChatSession(session);
    return session;
  });

  app.get<{ Params: { chatId: string } }>("/v1/chats/:chatId", async (request, reply) => {
    const session = getChatSession(request.params.chatId);

    if (!session) {
      return reply.code(404).send({
        message: "Chat not found",
      });
    }

    return session;
  });

  app.post<{ Params: { chatId: string } }>("/v1/chats/:chatId/messages", async (request, reply) => {
    const session = getChatSession(request.params.chatId);

    if (!session) {
      return reply.code(404).send({
        message: "Chat not found",
      });
    }

    const input = createChatMessageSchema.parse(request.body);
    const seed = resolvePersonaSeed({
      targetType: session.targetType,
      personaId: session.targetPersonaId ?? undefined,
      personaVersionId: session.targetPersonaVersionId,
      shareSlug: session.shareSlug ?? undefined,
    });

    if (!seed) {
      return reply.code(404).send({
        message: "Persona seed not found",
      });
    }

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

    const replyPayload = chatReplySchema.parse(createSeedReply(seed, input.content));
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
    saveChatSession(session);

    return assistantMessage;
  });
};
