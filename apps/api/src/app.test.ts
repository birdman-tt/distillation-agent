import assert from "node:assert/strict";
import test from "node:test";

import { getSql, resetSqlForTests } from "./db/client.js";

test("anonymous session can create, verify, and continue owning a persona through worker-backed distill", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }, workerModule] = await Promise.all([
    import("./app.js"),
    import(new URL("../../worker/src/app.ts", import.meta.url).href),
  ]);
  const { buildWorkerApp } = workerModule as { buildWorkerApp: () => { listen: Function; close: Function; server: { address: () => unknown } } };

  const workerApp = buildWorkerApp();
  await workerApp.listen({ host: "127.0.0.1", port: 0 });
  const address = workerApp.server.address();
  assert.ok(address && typeof address === "object" && "port" in address);
  const workerAddress = new URL(`http://127.0.0.1:${address.port}`);

  process.env.WORKER_BASE_URL = workerAddress.toString().replace(/\/$/, "");

  const apiApp = buildApiApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "browser-1" },
    });
    assert.equal(anonymous.statusCode, 200);
    const anonymousBody = anonymous.json();

    const createdPersona = await apiApp.inject({
      method: "POST",
      url: "/v1/personae",
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
      payload: {
        displayName: "测试对象",
        personaType: "ORIGINAL_PERSONA",
        originType: "USER",
        distillFocus: ["表达", "判断"],
      },
    });
    assert.equal(createdPersona.statusCode, 200);
    const persona = createdPersona.json();
    const persistedPersona = await sql<{ id: string }[]>`
      select id from personae where id = ${persona.id}::uuid
    `;
    assert.equal(persistedPersona.length, 1);

    const sourceResponse = await apiApp.inject({
      method: "POST",
      url: `/v1/personae/${persona.id}/sources/url`,
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
      payload: {
        url: "https://example.com/persona",
        sourceKind: "PRIMARY",
      },
    });
    assert.equal(sourceResponse.statusCode, 200);
    const source = sourceResponse.json();
    const persistedSource = await sql<{ id: string }[]>`
      select id from persona_sources where id = ${source.id}::uuid
    `;
    assert.equal(persistedSource.length, 1);

    const textSources = [];
    for (const [index, payload] of [
      { content: "第一份文本资料，偏一手视角。", sourceKind: "PRIMARY" },
      { content: "第二份文本资料，补充其判断方式。", sourceKind: "SECONDARY" },
      { content: "第三份文本资料，补充其表达风格。", sourceKind: "PRIMARY" },
      { content: "第四份文本资料，补充其价值取向。", sourceKind: "SECONDARY" },
    ].entries()) {
      const response = await apiApp.inject({
        method: "POST",
        url: `/v1/personae/${persona.id}/sources/text`,
        headers: {
          authorization: `Bearer ${anonymousBody.accessToken}`,
        },
        payload: {
          title: `text-${index + 1}`,
          ...payload,
        },
      });
      assert.equal(response.statusCode, 200);
      textSources.push(response.json());
    }

    const reviewWithoutReviewer = await apiApp.inject({
      method: "POST",
      url: `/v1/reviews/sources/${sourceResponse.json().id}/approve`,
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
      payload: {
        reason: "should fail",
      },
    });
    assert.equal(reviewWithoutReviewer.statusCode, 403);

    const upgraded = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/web/sms/verify",
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
      payload: {
        phoneNumber: "13800000000",
        code: "123456",
      },
    });
    assert.equal(upgraded.statusCode, 200);
    const upgradedBody = upgraded.json();

    const reviewer = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/dev/reviewer",
    });
    assert.equal(reviewer.statusCode, 200);
    const reviewerBody = reviewer.json();

    for (const sourceId of [source.id, ...textSources.map((item) => item.id)]) {
      const approved = await apiApp.inject({
        method: "POST",
        url: `/v1/reviews/sources/${sourceId}/approve`,
        headers: {
          authorization: `Bearer ${reviewerBody.accessToken}`,
        },
        payload: {
          reason: "approved",
        },
      });
      assert.equal(approved.statusCode, 200);
    }

    const distilled = await apiApp.inject({
      method: "POST",
      url: `/v1/personae/${persona.id}/distill`,
      headers: {
        authorization: `Bearer ${upgradedBody.accessToken}`,
      },
    });
    assert.equal(distilled.statusCode, 200);
    const distilledBody = distilled.json();
    assert.equal(distilledBody.status, "CANDIDATE");
    const persistedVersion = await sql<{ id: string; status: string }[]>`
      select id, status
      from persona_versions
      where id = ${distilledBody.id}::uuid
    `;
    assert.equal(persistedVersion.length, 1);
    assert.equal(persistedVersion[0]?.status, "CANDIDATE");

    const submitted = await apiApp.inject({
      method: "POST",
      url: `/v1/persona-versions/${distilledBody.id}/submit-publish-review`,
      headers: {
        authorization: `Bearer ${upgradedBody.accessToken}`,
      },
    });
    assert.equal(submitted.statusCode, 200);

    const published = await apiApp.inject({
      method: "POST",
      url: `/v1/reviews/persona-versions/${distilledBody.id}/approve-publish`,
      headers: {
        authorization: `Bearer ${reviewerBody.accessToken}`,
      },
      payload: {
        reason: "publish",
      },
    });
    assert.equal(published.statusCode, 200);
    assert.equal(published.json().version.status, "PUBLISHED");
    assert.ok(published.json().share?.shareSlug);

    const persistedShare = await sql<{ share_slug: string }[]>`
      select share_slug
      from share_links
      where persona_version_id = ${distilledBody.id}::uuid
    `;
    assert.equal(persistedShare.length, 1);

    const chat = await apiApp.inject({
      method: "POST",
      url: "/v1/chats",
      payload: {
        targetType: "published_persona",
        personaId: persona.id,
      },
    });
    assert.equal(chat.statusCode, 200);
    const chatBody = chat.json();

    const assistant = await apiApp.inject({
      method: "POST",
      url: `/v1/chats/${chatBody.id}/messages`,
      payload: {
        content: "你怎么看现在的处境？",
      },
    });
    assert.equal(assistant.statusCode, 200);

    const persistedChat = await sql<{ id: string }[]>`
      select id from chats where id = ${chatBody.id}::uuid
    `;
    assert.equal(persistedChat.length, 1);
    const persistedMessages = await sql<{ count: string }[]>`
      select count(*)::text as count
      from chat_messages
      where chat_id = ${chatBody.id}::uuid
    `;
    assert.equal(persistedMessages[0]?.count, "2");

    const feedback = await apiApp.inject({
      method: "POST",
      url: "/v1/feedback",
      headers: {
        authorization: `Bearer ${upgradedBody.accessToken}`,
      },
      payload: {
        personaId: persona.id,
        personaVersionId: distilledBody.id,
        chatMessageId: assistant.json().id,
        feedbackKind: "LIKENESS",
        feedbackValue: "POSITIVE",
      },
    });
    assert.equal(feedback.statusCode, 200);

    const persistedFeedback = await sql<{ count: string }[]>`
      select count(*)::text as count
      from persona_feedback
      where persona_id = ${persona.id}::uuid
    `;
    assert.equal(persistedFeedback[0]?.count, "1");
  } finally {
    await apiApp.close();
    await workerApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }
});

test("official seed persona can open a persisted chat session", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }] = await Promise.all([import("./app.js")]);
  const apiApp = buildApiApp();

  try {
    const chat = await apiApp.inject({
      method: "POST",
      url: "/v1/chats",
      payload: {
        targetType: "published_persona",
        personaId: "0f2610a1-34b2-46c8-b915-f92d928f06a1",
      },
    });

    assert.equal(chat.statusCode, 200);
    const body = chat.json();
    assert.ok(body.id);
    assert.equal(body.targetPersonaId, null);
    assert.equal(body.targetPersonaVersionId, "64c071d9-a7a6-4dad-8a67-dcb0370d03f8");
  } finally {
    await apiApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }
});
