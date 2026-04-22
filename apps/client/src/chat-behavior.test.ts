import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

import { sendChatMessage } from "@hall-of-fame/api-client";

const h5Source = readFileSync(new URL("./h5-app.ts", import.meta.url), "utf8");

test("chat submit clears the composer before awaiting the reply request", () => {
  const clearIndex = h5Source.indexOf('input.value = "";');
  const sendIndex = h5Source.indexOf("void deliverUserBubble(userBubble, content);");

  assert.ok(clearIndex >= 0, "expected chat script to clear the textarea");
  assert.ok(sendIndex >= 0, "expected chat script to hand off the async send flow");
  assert.ok(clearIndex < sendIndex, "expected textarea clearing to happen before async delivery starts");
});

test("chat submit script renders a retry control for failed user messages", () => {
  assert.match(h5Source, /data-chat-retry/);
  assert.match(h5Source, /重试/);
});

test("sendChatMessage throws the API error body when the request fails", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    return new Response(JSON.stringify({ message: "reply failed" }), {
      status: 502,
      headers: {
        "content-type": "application/json",
      },
    });
  });

  await assert.rejects(() => sendChatMessage("https://example.com", "chat-1", "你好"), /reply failed/);

  fetchMock.mock.restore();
});
