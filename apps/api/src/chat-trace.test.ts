import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { getSql, resetSqlForTests } from "./db/client.js";

process.env.CHAT_REALTIME_ENABLED = "false";
process.env.CHAT_PLANNER_ENABLED = "false";
process.env.CHAT_PROACTIVE_ENABLED = "false";

const createChatAndSendMessage = async (input?: {
  personaId?: string;
  content?: string;
}) => {
  const { buildApiApp } = await import("./app.js");
  const apiApp = buildApiApp();
  const anonymous = await apiApp.inject({
    method: "POST",
    url: "/v1/auth/anonymous",
    payload: { deviceId: `chat-trace-${randomUUID()}` },
  });
  assert.equal(anonymous.statusCode, 200);
  const accessToken = anonymous.json().accessToken as string;

  const chat = await apiApp.inject({
    method: "POST",
    url: "/v1/chats",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    payload: {
      targetType: "published_persona",
      personaId: input?.personaId ?? "0f2610a1-34b2-46c8-b915-f92d928f06a1",
    },
  });
  assert.equal(chat.statusCode, 200);

  const chatId = chat.json().id as string;
  const reply = await apiApp.inject({
    method: "POST",
    url: `/v1/chats/${chatId}/messages`,
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    payload: {
      content: input?.content ?? "如果局势突然失控，你会先稳住什么？",
    },
  });

  return { apiApp, chatId, reply };
};

test("chat reply returns x-turn-trace-id and exposes the persisted trace detail", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const { apiApp, reply } = await createChatAndSendMessage();

  try {
    assert.equal(reply.statusCode, 200);

    const turnTraceId = reply.headers["x-turn-trace-id"];
    assert.equal(typeof turnTraceId, "string");
    assert.ok(turnTraceId);

    const traceResponse = await apiApp.inject({
      method: "GET",
      url: `/internal/debug/chat-traces/${turnTraceId}`,
    });

    assert.equal(traceResponse.statusCode, 200);
    const traceBody = traceResponse.json();
    assert.equal(traceBody.trace.turnTraceId, turnTraceId);
    assert.equal(traceBody.trace.status, "fallback_success");
    assert.ok(Array.isArray(traceBody.events));
    assert.ok(traceBody.events.some((event: { eventName: string }) => event.eventName === "chat.turn.received"));
    assert.ok(traceBody.events.some((event: { eventName: string }) => event.eventName === "chat.prompt.built"));
    assert.ok(traceBody.events.some((event: { eventName: string }) => event.eventName === "chat.model.request.failed"));
    assert.ok(traceBody.events.some((event: { eventName: string }) => event.eventName === "chat.turn.completed"));
    assert.ok(Array.isArray(traceBody.artifacts));
    assert.ok(traceBody.artifacts.some((artifact: { artifactKey: string }) => artifact.artifactKey === "system_prompt"));
    assert.ok(traceBody.artifacts.some((artifact: { artifactKey: string }) => artifact.artifactKey === "user_prompt"));
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

test("chat traces can be listed back by chatId in reverse chronological order", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const { buildApiApp } = await import("./app.js");
  const apiApp = buildApiApp();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "chat-trace-list" },
    });
    assert.equal(anonymous.statusCode, 200);
    const accessToken = anonymous.json().accessToken as string;

    const chat = await apiApp.inject({
      method: "POST",
      url: "/v1/chats",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        targetType: "published_persona",
        personaId: "0f2610a1-34b2-46c8-b915-f92d928f06a1",
      },
    });
    assert.equal(chat.statusCode, 200);
    const chatId = chat.json().id as string;

    const firstReply = await apiApp.inject({
      method: "POST",
      url: `/v1/chats/${chatId}/messages`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        content: "第一问：先看秩序还是先看人心？",
      },
    });
    assert.equal(firstReply.statusCode, 200);

    const secondReply = await apiApp.inject({
      method: "POST",
      url: `/v1/chats/${chatId}/messages`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        content: "第二问：如果上一步没起效，你会怎么调整？",
      },
    });
    assert.equal(secondReply.statusCode, 200);

    const firstTraceId = firstReply.headers["x-turn-trace-id"];
    const secondTraceId = secondReply.headers["x-turn-trace-id"];
    assert.equal(typeof firstTraceId, "string");
    assert.equal(typeof secondTraceId, "string");

    const traceListResponse = await apiApp.inject({
      method: "GET",
      url: `/internal/debug/chat-traces?chatId=${encodeURIComponent(chatId)}`,
    });

    assert.equal(traceListResponse.statusCode, 200);
    const traceListBody = traceListResponse.json();
    assert.ok(Array.isArray(traceListBody.items));
    assert.ok(traceListBody.items.length >= 2);
    assert.equal(traceListBody.items[0]?.turnTraceId, secondTraceId);
    assert.ok(traceListBody.items.some((item: { turnTraceId: string }) => item.turnTraceId === firstTraceId));
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

test("chat message returns accepted immediately when realtime is enabled", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  const originalRealtimeEnabled = process.env.CHAT_REALTIME_ENABLED;
  const originalPlannerEnabled = process.env.CHAT_PLANNER_ENABLED;
  process.env.DEEPSEEK_API_KEY = "";
  process.env.CHAT_REALTIME_ENABLED = "true";
  process.env.CHAT_PLANNER_ENABLED = "false";

  const { buildApiApp } = await import("./app.js");
  const apiApp = buildApiApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "chat-realtime-accepted" },
    });
    assert.equal(anonymous.statusCode, 200);
    const accessToken = anonymous.json().accessToken as string;

    const chat = await apiApp.inject({
      method: "POST",
      url: "/v1/chats",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        targetType: "published_persona",
        personaId: "0f2610a1-34b2-46c8-b915-f92d928f06a1",
      },
    });
    assert.equal(chat.statusCode, 200);
    const chatId = chat.json().id as string;

    const startedAt = Date.now();
    const accepted = await apiApp.inject({
      method: "POST",
      url: `/v1/chats/${chatId}/messages`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        content: "这条消息应该先落库再异步回复",
      },
    });

    assert.equal(accepted.statusCode, 202);
    assert.ok(Date.now() - startedAt < 3000);
    const body = accepted.json();
    assert.equal(body.status, "accepted");
    assert.equal(body.message.role, "USER");
    assert.equal(typeof body.turnTraceId, "string");

    let messageCount = "0";
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const [row] = await sql<{ count: string }[]>`
        select count(*)::text as count
        from chat_messages
        where chat_id = ${chatId}::uuid
      `;
      messageCount = row?.count ?? "0";
      if (messageCount === "2") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(messageCount, "2");
  } finally {
    await apiApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
    if (originalRealtimeEnabled !== undefined) {
      process.env.CHAT_REALTIME_ENABLED = originalRealtimeEnabled;
    } else {
      delete process.env.CHAT_REALTIME_ENABLED;
    }
    if (originalPlannerEnabled !== undefined) {
      process.env.CHAT_PLANNER_ENABLED = originalPlannerEnabled;
    } else {
      delete process.env.CHAT_PLANNER_ENABLED;
    }
  }
});

test("local chat trace viewer serves html and assets when internal debug is enabled", async () => {
  const originalEnabled = process.env.CHAT_TRACE_INTERNAL_ENABLED;
  process.env.CHAT_TRACE_INTERNAL_ENABLED = "true";

  const { buildApiApp } = await import("./app.js");
  const apiApp = buildApiApp();

  try {
    const viewerResponse = await apiApp.inject({
      method: "GET",
      url: "/internal/debug/chat-traces/viewer",
    });

    assert.equal(viewerResponse.statusCode, 200);
    assert.match(String(viewerResponse.headers["content-type"]), /text\/html/);
    assert.match(viewerResponse.body, /Chat Trace Viewer/);
    assert.match(viewerResponse.body, /name="turnTraceId"/);
    assert.match(viewerResponse.body, /name="chatId"/);
    assert.match(viewerResponse.body, /viewer\.js/);
    assert.match(viewerResponse.body, /viewer\.css/);

    const viewerScript = await apiApp.inject({
      method: "GET",
      url: "/internal/debug/chat-traces/viewer.js",
    });
    assert.equal(viewerScript.statusCode, 200);
    assert.match(String(viewerScript.headers["content-type"]), /javascript/);
    assert.match(viewerScript.body, /x-internal-debug-key/);
    assert.match(viewerScript.body, /\/internal\/debug\/chat-traces\//);

    const viewerStyles = await apiApp.inject({
      method: "GET",
      url: "/internal/debug/chat-traces/viewer.css",
    });
    assert.equal(viewerStyles.statusCode, 200);
    assert.match(String(viewerStyles.headers["content-type"]), /text\/css/);
    assert.match(viewerStyles.body, /\.trace-layout/);
  } finally {
    await apiApp.close();
    await resetSqlForTests();
    if (originalEnabled !== undefined) {
      process.env.CHAT_TRACE_INTERNAL_ENABLED = originalEnabled;
    } else {
      delete process.env.CHAT_TRACE_INTERNAL_ENABLED;
    }
  }
});

test("local chat trace viewer returns 404 when internal debug is disabled", async () => {
  const originalEnabled = process.env.CHAT_TRACE_INTERNAL_ENABLED;
  process.env.CHAT_TRACE_INTERNAL_ENABLED = "false";

  const { buildApiApp } = await import("./app.js");
  const apiApp = buildApiApp();

  try {
    const viewerResponse = await apiApp.inject({
      method: "GET",
      url: "/internal/debug/chat-traces/viewer",
    });

    assert.equal(viewerResponse.statusCode, 404);
  } finally {
    await apiApp.close();
    await resetSqlForTests();
    if (originalEnabled !== undefined) {
      process.env.CHAT_TRACE_INTERNAL_ENABLED = originalEnabled;
    } else {
      delete process.env.CHAT_TRACE_INTERNAL_ENABLED;
    }
  }
});

test("viewer html still loads when token is configured, but trace json requires the token header", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  const originalEnabled = process.env.CHAT_TRACE_INTERNAL_ENABLED;
  const originalToken = process.env.CHAT_TRACE_INTERNAL_TOKEN;
  process.env.DEEPSEEK_API_KEY = "";
  process.env.CHAT_TRACE_INTERNAL_ENABLED = "true";
  process.env.CHAT_TRACE_INTERNAL_TOKEN = "viewer-token";

  const { apiApp, reply } = await createChatAndSendMessage();

  try {
    const turnTraceId = reply.headers["x-turn-trace-id"];
    assert.equal(typeof turnTraceId, "string");

    const viewerResponse = await apiApp.inject({
      method: "GET",
      url: "/internal/debug/chat-traces/viewer",
    });
    assert.equal(viewerResponse.statusCode, 200);

    const forbiddenTraceResponse = await apiApp.inject({
      method: "GET",
      url: `/internal/debug/chat-traces/${turnTraceId}`,
    });
    assert.equal(forbiddenTraceResponse.statusCode, 403);

    const allowedTraceResponse = await apiApp.inject({
      method: "GET",
      url: `/internal/debug/chat-traces/${turnTraceId}`,
      headers: {
        "x-internal-debug-key": "viewer-token",
      },
    });
    assert.equal(allowedTraceResponse.statusCode, 200);
  } finally {
    await apiApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
    if (originalEnabled !== undefined) {
      process.env.CHAT_TRACE_INTERNAL_ENABLED = originalEnabled;
    } else {
      delete process.env.CHAT_TRACE_INTERNAL_ENABLED;
    }
    if (originalToken !== undefined) {
      process.env.CHAT_TRACE_INTERNAL_TOKEN = originalToken;
    } else {
      delete process.env.CHAT_TRACE_INTERNAL_TOKEN;
    }
  }
});
