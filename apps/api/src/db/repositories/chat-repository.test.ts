import assert from "node:assert/strict";
import test from "node:test";

import { loadLocalEnv } from "@hall-of-fame/runtime-env";

import { ensureDatabaseSchema } from "../bootstrap.js";
import { resetSqlForTests, getSql } from "../client.js";
import { appendPersistedChatMessages, savePersistedChatSession } from "./chat-repository.js";

const chatId = "11111111-1111-4111-8111-111111111111";
const personaVersionId = "64c071d9-a7a6-4dad-8a67-dcb0370d03f8";

test("appendPersistedChatMessages persists message metadata for assistant outputs", async () => {
  await loadLocalEnv();
  const sql = getSql();

  try {
    await ensureDatabaseSchema();
    await savePersistedChatSession({
      id: chatId,
      targetType: "published_persona",
      targetPersonaId: null,
      targetPersonaVersionId: personaVersionId,
      shareSlug: null,
      messages: [],
    });

    await appendPersistedChatMessages(chatId, [
      {
        id: "22222222-2222-4222-8222-222222222222",
        role: "ASSISTANT",
        content: "第一条回复",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
        messageMetadata: {
          turnTraceId: "turn_test",
          source: "reply",
          sequence: 1,
          plannerModel: "MiniMax-M2.7",
          responderModel: "deepseek-v4-flash",
        },
      } as any,
    ]);

    const rows = await sql<{ messageMetadata: Record<string, unknown> }[]>`
      select message_metadata as "messageMetadata"
      from chat_messages
      where id = ${"22222222-2222-4222-8222-222222222222"}::uuid
    `;

    assert.equal(rows[0]?.messageMetadata.turnTraceId, "turn_test");
    assert.equal(rows[0]?.messageMetadata.source, "reply");
    assert.equal(rows[0]?.messageMetadata.sequence, 1);
  } finally {
    await resetSqlForTests();
  }
});
