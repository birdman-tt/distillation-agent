import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { buildApiApp } from "../../app.js";
import { resetSqlForTests } from "../../db/client.js";
import { appendChatMessages, saveChatSession } from "../../store/chat-store.js";
import { assembleChatContext } from "./assemble-chat-context.js";

test("assembleChatContext limits assistant carry-over in recent turns and retrieved memory", async () => {
  const apiApp = buildApiApp();
  await apiApp.ready();

  const chatId = randomUUID();

  try {
    await saveChatSession({
      id: chatId,
      targetType: "published_persona",
      targetPersonaId: null,
      targetPersonaVersionId: "64c071d9-a7a6-4dad-8a67-dcb0370d03f8",
      shareSlug: null,
      messages: [],
    });

    await appendChatMessages(chatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "你更看重秩序还是效率？",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date(Date.now() - 10_000).toISOString(),
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
        createdAt: new Date(Date.now() - 9_000).toISOString(),
      },
      {
        id: randomUUID(),
        role: "USER",
        content: "统一是不是意味着更强硬？",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date(Date.now() - 8_000).toISOString(),
      },
      {
        id: randomUUID(),
        role: "ASSISTANT",
        content: "强硬若换不来秩序，只是额外代价。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date(Date.now() - 7_000).toISOString(),
      },
    ]);

    const [latestUserMessage] = await appendChatMessages(chatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "你刚才说的秩序尺度，展开讲讲。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    assert.ok(latestUserMessage);

    const context = await assembleChatContext({
      chatId,
      personaId: null,
      personaVersionId: "64c071d9-a7a6-4dad-8a67-dcb0370d03f8",
      query: "你刚才说的秩序尺度，展开讲讲。",
      latestMessageId: latestUserMessage.messageId,
      latestTurnIndex: latestUserMessage.turnIndex,
      personaEvidence: [],
    });

    assert.ok(context.recentTurns.filter((item) => item.role === "ASSISTANT").length <= 1);
    assert.ok(context.retrievedMemories.filter((item) => item.role === "ASSISTANT").length <= 1);
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});
