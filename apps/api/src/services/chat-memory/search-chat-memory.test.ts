import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { buildApiApp } from "../../app.js";
import { appendChatMessages, saveChatSession } from "../../store/chat-store.js";
import { resetSqlForTests } from "../../db/client.js";
import { searchChatMemory } from "./search-chat-memory.js";

test("searchChatMemory returns relevant messages from the current chat only", async () => {
  const apiApp = buildApiApp();
  await apiApp.ready();

  const primaryChatId = randomUUID();
  const secondaryChatId = randomUUID();

  try {
    await saveChatSession({
      id: primaryChatId,
      targetType: "published_persona",
      targetPersonaId: null,
      targetPersonaVersionId: "64c071d9-a7a6-4dad-8a67-dcb0370d03f8",
      shareSlug: null,
      messages: [],
    });
    await saveChatSession({
      id: secondaryChatId,
      targetType: "published_persona",
      targetPersonaId: null,
      targetPersonaVersionId: "64c071d9-a7a6-4dad-8a67-dcb0370d03f8",
      shareSlug: null,
      messages: [],
    });

    await appendChatMessages(primaryChatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "你更看重秩序还是效率？",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date(Date.now() - 4_000).toISOString(),
      },
      {
        id: randomUUID(),
        role: "ASSISTANT",
        content: "我会先把秩序的尺度定住，再谈效率。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date(Date.now() - 3_000).toISOString(),
      },
    ]);

    await appendChatMessages(secondaryChatId, [
      {
        id: randomUUID(),
        role: "ASSISTANT",
        content: "这条消息只存在于另一个 chat，不应该被检索出来。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date(Date.now() - 2_000).toISOString(),
      },
    ]);

    const [latestUserMessage] = await appendChatMessages(primaryChatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "那你刚才说的秩序尺度，展开讲讲。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    assert.ok(latestUserMessage);

    const result = await searchChatMemory({
      toolName: "search_chat_memory",
      version: "v1",
      requestId: randomUUID(),
      chatId: primaryChatId,
      personaId: null,
      personaVersionId: "64c071d9-a7a6-4dad-8a67-dcb0370d03f8",
      query: "那你刚才说的秩序尺度，展开讲讲。",
      latestMessageId: latestUserMessage.messageId,
      latestTurnIndex: latestUserMessage.turnIndex,
      options: {
        topK: 4,
        excludeRecentTurns: 0,
      },
    });

    assert.ok(result.hits.length > 0);
    assert.match(result.hits[0]?.content ?? "", /秩序的尺度/);
    assert.ok(result.hits.every((item) => !/另一个 chat/.test(item.content)));
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});
