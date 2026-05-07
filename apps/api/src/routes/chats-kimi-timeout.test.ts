import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CHAT_WEB_CONTEXT_UNAVAILABLE_COPY,
  ChatKimiResearchTimeoutError,
  readChatKimiResearchTimeoutMs,
  runKimiResearcherWithTimeout,
} from "./chats.js";

test("readChatKimiResearchTimeoutMs defaults to 30 seconds and ignores blank invalid env values", () => {
  const previousTimeout = process.env.CHAT_KIMI_RESEARCH_TIMEOUT_MS;

  try {
    delete process.env.CHAT_KIMI_RESEARCH_TIMEOUT_MS;
    assert.equal(readChatKimiResearchTimeoutMs(), 30_000);

    process.env.CHAT_KIMI_RESEARCH_TIMEOUT_MS = "";
    assert.equal(readChatKimiResearchTimeoutMs(), 30_000);

    process.env.CHAT_KIMI_RESEARCH_TIMEOUT_MS = "abc";
    assert.equal(readChatKimiResearchTimeoutMs(), 30_000);

    process.env.CHAT_KIMI_RESEARCH_TIMEOUT_MS = "500";
    assert.equal(readChatKimiResearchTimeoutMs(), 1_000);

    process.env.CHAT_KIMI_RESEARCH_TIMEOUT_MS = "45000";
    assert.equal(readChatKimiResearchTimeoutMs(), 45_000);
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.CHAT_KIMI_RESEARCH_TIMEOUT_MS;
    } else {
      process.env.CHAT_KIMI_RESEARCH_TIMEOUT_MS = previousTimeout;
    }
  }
});

test("runKimiResearcherWithTimeout aborts and returns when the researcher ignores the signal", async () => {
  let signalWasAborted = false;

  await assert.rejects(
    runKimiResearcherWithTimeout(
      {
        userMessage: "今天有什么新消息？",
        webSearchQuery: "今天 新闻",
        plannerReason: "fresh information requested",
        locale: "zh-CN",
        maxFindings: 3,
      },
      {
        timeoutMs: 10,
        researcher: async (_input, deps) => {
          deps?.signal?.addEventListener("abort", () => {
            signalWasAborted = true;
          });
          return new Promise(() => {
            // Intentionally never resolves; the wrapper must enforce the deadline.
          });
        },
      },
    ),
    ChatKimiResearchTimeoutError,
  );

  assert.equal(signalWasAborted, true);
});

test("chat Kimi fallback context does not expose internal provider details", () => {
  assert.doesNotMatch(CHAT_WEB_CONTEXT_UNAVAILABLE_COPY, /Kimi|timeout|429|engine overloaded|tool/i);

  const chatsRouteSource = readFileSync(new URL("./chats.ts", import.meta.url), "utf8");
  const failureBlockStart = chatsRouteSource.indexOf("rawWebContext = unavailableWebContext({");
  assert.ok(failureBlockStart >= 0, "expected unavailable web context path to exist");
  assert.doesNotMatch(chatsRouteSource, /Kimi researcher failed/);
});
