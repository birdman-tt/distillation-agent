import { randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";

import { getSessionByAccessToken } from "../store/auth-store.js";
import { getChatSession } from "../store/chat-store.js";
import { chatRealtimeHub } from "../services/realtime/realtime-hub.js";
import { expireChatRealtimePresence, upsertChatRealtimePresence } from "../services/realtime/presence-repository.js";
import { isChatRealtimeEnabled } from "../services/realtime/realtime-pg-listener.js";

const parseSubscribeMessage = (raw: unknown) => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as { type?: unknown; token?: unknown; chatId?: unknown };
  if (value.type !== "auth.subscribe" || typeof value.token !== "string" || typeof value.chatId !== "string") {
    return null;
  }
  return {
    token: value.token,
    chatId: value.chatId,
  };
};

export const realtimeRoute: FastifyPluginAsync = async (app) => {
  app.get("/v1/realtime", { websocket: true }, (socket) => {
    const realtimeSessionId = `rt_${randomUUID()}`;
    let subscribedChatId: string | null = null;
    let heartbeat: NodeJS.Timeout | null = null;

    const closeWithError = (message: string) => {
      socket.send(JSON.stringify({ type: "error", message }));
      socket.close();
    };

    socket.on("message", async (raw: { toString(): string }) => {
      try {
        if (!isChatRealtimeEnabled()) {
          closeWithError("Realtime is disabled");
          return;
        }

        const parsed = parseSubscribeMessage(JSON.parse(raw.toString()));
        if (!parsed) {
          closeWithError("Invalid realtime subscribe message");
          return;
        }

        const actor = getSessionByAccessToken(parsed.token);
        if (!actor) {
          closeWithError("Authentication required");
          return;
        }

        const chat = await getChatSession(parsed.chatId);
        if (!chat) {
          closeWithError("Chat not found");
          return;
        }

        if (subscribedChatId) {
          chatRealtimeHub.unsubscribe(subscribedChatId, socket);
        }

        subscribedChatId = parsed.chatId;
        chatRealtimeHub.subscribe(parsed.chatId, socket);
        await upsertChatRealtimePresence({
          sessionId: realtimeSessionId,
          chatId: parsed.chatId,
          userId: actor.userId,
        });
        socket.send(JSON.stringify({ type: "chat.subscription.ready", chatId: parsed.chatId }));

        if (!heartbeat) {
          heartbeat = setInterval(() => {
            if (subscribedChatId) {
              void upsertChatRealtimePresence({
                sessionId: realtimeSessionId,
                chatId: subscribedChatId,
                userId: actor.userId,
              }).catch((error) => app.log.warn({ error }, "failed to refresh realtime presence"));
            }
          }, 15_000);
        }
      } catch (error) {
        app.log.warn({ error }, "realtime subscribe failed");
        closeWithError(error instanceof Error ? error.message : "Realtime subscribe failed");
      }
    });

    socket.on("close", () => {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      if (subscribedChatId) {
        chatRealtimeHub.unsubscribe(subscribedChatId, socket);
      }
      void expireChatRealtimePresence(realtimeSessionId).catch((error) =>
        app.log.warn({ error }, "failed to expire realtime presence"),
      );
    });
  });
};
