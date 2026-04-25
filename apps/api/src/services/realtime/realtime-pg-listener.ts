import type { FastifyBaseLogger } from "fastify";

import { getSql } from "../../db/client.js";
import { chatRealtimeHub, type RealtimeEvent } from "./realtime-hub.js";

const channel = "chat_realtime_events";
let unlisten: (() => Promise<void>) | null = null;

export const isChatRealtimeEnabled = () => process.env.CHAT_REALTIME_ENABLED === "true";

export const startRealtimePostgresListener = async (logger: FastifyBaseLogger) => {
  if (!isChatRealtimeEnabled() || unlisten) {
    return;
  }

  const result = await getSql().listen(channel, (value) => {
    try {
      const event = JSON.parse(value) as RealtimeEvent;
      const delivered = chatRealtimeHub.publish(event);
      logger.info({ kind: "chat_realtime_pg_event", eventType: event.type, chatId: event.chatId, delivered });
    } catch (error) {
      logger.warn(
        { kind: "chat_realtime_pg_event_invalid", errorMessage: error instanceof Error ? error.message : "unknown" },
        "invalid chat realtime event",
      );
    }
  });

  unlisten = result.unlisten;
};

export const stopRealtimePostgresListener = async () => {
  if (!unlisten) {
    return;
  }
  const stop = unlisten;
  unlisten = null;
  await stop();
};

