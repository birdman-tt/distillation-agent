import type { z } from "zod";

import { chatSessionSchema } from "@hall-of-fame/contracts";

import { getPersistedChatSession, savePersistedChatSession } from "../db/repositories/chat-repository.js";

type ChatSession = z.infer<typeof chatSessionSchema>;

export const saveChatSession = async (session: ChatSession) => savePersistedChatSession(session);

export const getChatSession = async (chatId: string) => getPersistedChatSession(chatId);
