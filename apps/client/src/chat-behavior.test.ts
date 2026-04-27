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

test("chat submit script creates an anonymous session before opening a persisted chat", () => {
  const ensureChatBlock = h5Source.match(
    /const ensureChatId = async \(\) => \{[\s\S]*?await HallOfFameClient\.ensureAnonymousSession\(\);[\s\S]*?HallOfFameClient\.requestJson\("\/v1\/chats", \{/,
  );

  assert.ok(ensureChatBlock, "expected chat script to ensure an anonymous session before chat creation");
});

test("h5 shell does not render auth state as visible page chrome", () => {
  assert.doesNotMatch(h5Source, /data-session-slot/);
  assert.doesNotMatch(h5Source, /session-banner/);
  assert.doesNotMatch(h5Source, /已进入匿名体验/);
});

test("chat page keeps the return action reachable in long threads", () => {
  assert.match(h5Source, /\.chat-stage\s*>\s*\.top-bar\s*\{[\s\S]*?position:\s*sticky/);
  assert.match(h5Source, /\.chat-stage\s+\.thread-header\s*\{[\s\S]*?top:\s*var\(--chat-sticky-offset\)/);
});

test("history links reopen the existing chat session", () => {
  assert.match(h5Source, /\?chatId=" \+ encodeURIComponent\(item\.id\) \+ "&from=history/);
});

test("chat page resumes persisted messages before continuing a history chat", () => {
  assert.match(h5Source, /initialChatId/);
  assert.match(h5Source, /renderExistingMessages/);
  assert.match(h5Source, /requestJson\("\/v1\/chats\/" \+ encodeURIComponent\(initialChatId\)/);
});

test("chat page deduplicates HTTP and realtime messages by message id", () => {
  assert.match(h5Source, /appendMessageIfMissing/);
  assert.match(h5Source, /data-message-id/);
  assert.match(h5Source, /seenMessageIds/);
});

test("chat page treats async accepted message responses as delivery acknowledgements", () => {
  assert.match(h5Source, /reply\.status === "accepted"/);
  assert.doesNotMatch(h5Source, /消息已发送，等待回复/);
});

test("chat page uses typing indicator for assistant replies, not message delivery", () => {
  assert.match(h5Source, /let pendingAssistantReplies = 0/);
  assert.match(h5Source, /const beginAssistantReplyWait = \(\) => \{/);
  assert.match(h5Source, /const endAssistantReplyWait = \(\) => \{/);
  assert.match(h5Source, /if \(pendingAssistantReplies > 0\)/);
  assert.doesNotMatch(h5Source, /pendingDeliveries/);

  const deliveryPendingIndex = h5Source.indexOf("setUserBubblePending(bubble);");
  const acceptedIndex = h5Source.indexOf('if (reply && reply.status === "accepted")');
  const typingBeginIndex = h5Source.indexOf("beginAssistantReplyWait();");

  assert.ok(deliveryPendingIndex >= 0, "expected user bubble to show its own delivery pending state");
  assert.ok(acceptedIndex >= 0, "expected async accepted response handling");
  assert.ok(typingBeginIndex > acceptedIndex, "expected assistant typing to begin only after send is accepted");
});

test("chat page keeps the composer pinned and inline on the focused chat screen", () => {
  assert.match(h5Source, /\.shell\.chat-only\s+\.chat-stage\.chat-focused\s+\.composer-shell\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(
    h5Source,
    /\.shell\.chat-only\s+\.chat-stage\.chat-focused\s+\.composer-shell\s*\{[\s\S]*?bottom:\s*calc\(10px \+ env\(safe-area-inset-bottom\)\)/,
  );
  assert.match(h5Source, /\.composer\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(h5Source, /\.composer textarea\s*\{[\s\S]*?height:\s*52px/);
  assert.match(h5Source, /\.composer textarea\s*\{[\s\S]*?scrollbar-width:\s*thin/);
  assert.match(h5Source, /\.composer textarea::-webkit-scrollbar-thumb\s*\{[\s\S]*?background:\s*var\(--input-scrollbar-thumb\)/);
  assert.match(h5Source, /\.composer-actions button\s*\{[\s\S]*?height:\s*52px/);
  assert.match(h5Source, /const syncComposerHeight = \(\) => \{/);
  assert.match(h5Source, /composerInput\?\.addEventListener\("input", syncComposerHeight\)/);
  assert.match(h5Source, /\.shell\.chat-only\s+\.chat-stage\s+\[data-chat-status\]\s*\{[\s\S]*?display:\s*none/);
});

test("preview page publishes directly instead of submitting publish review", () => {
  assert.match(h5Source, /data-publish-private/);
  assert.match(h5Source, /data-publish-public/);
  assert.ok(h5Source.includes('/v1/persona-versions/" + versionId + "/publish'));
  assert.doesNotMatch(h5Source, /submit-publish-review/);
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
