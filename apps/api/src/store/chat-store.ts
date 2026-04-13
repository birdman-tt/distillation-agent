import { chatSessionSchema } from "@hall-of-fame/contracts";
import type { z } from "zod";

type ChatSession = z.infer<typeof chatSessionSchema>;

const chats = new Map<string, ChatSession>();

export const saveChatSession = (session: ChatSession) => {
  chats.set(session.id, session);
  return session;
};

export const getChatSession = (chatId: string) => chats.get(chatId) ?? null;
