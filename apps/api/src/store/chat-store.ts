import type { z } from "zod";

import { chatSessionSchema } from "@hall-of-fame/contracts";

import {
  appendPersistedChatMessages,
  getPersistedChatSessionAccess,
  getPersistedChatSession,
  listPersistedChatSessionSummariesByCreator,
  listPersistedChatMessagesForSearch,
  listPersistedRecentChatMessages,
  savePersistedChatSession,
  type PersistableChatMessage,
  type PersistedChatMessageRecord,
  type PersistedChatSessionSummaryRecord,
} from "../db/repositories/chat-repository.js";

type ChatSession = z.infer<typeof chatSessionSchema>;

export const saveChatSession = async (
  session: ChatSession,
  input?: {
    createdByUserId?: string | null;
  },
) => savePersistedChatSession(session, input);

export const getChatSession = async (chatId: string) => getPersistedChatSession(chatId);

export const getChatSessionAccess = async (chatId: string) => getPersistedChatSessionAccess(chatId);

export const listChatSessionSummariesByCreator = async (input: {
  createdByUserId: string;
  limit: number;
}) => listPersistedChatSessionSummariesByCreator(input);

export const appendChatMessages = async (chatId: string, messages: PersistableChatMessage[]) =>
  appendPersistedChatMessages(chatId, messages);

export const listRecentChatMessages = async (input: {
  chatId: string;
  limit: number;
  excludeMessageIds?: string[];
  roles?: PersistedChatMessageRecord["role"][];
}) => listPersistedRecentChatMessages(input);

export const listChatMessagesForMemorySearch = async (input: {
  chatId: string;
  candidateLimit: number;
  excludeMessageIds?: string[];
  roles?: PersistedChatMessageRecord["role"][];
}) => listPersistedChatMessagesForSearch(input);

export type { PersistedChatMessageRecord, PersistedChatSessionSummaryRecord };
