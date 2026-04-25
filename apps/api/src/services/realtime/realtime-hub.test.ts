import assert from "node:assert/strict";
import test from "node:test";

import { chatRealtimeHub } from "./realtime-hub.js";

test("chat realtime hub publishes events only to sockets subscribed to the chat", () => {
  const delivered: string[] = [];
  const subscribedSocket = {
    readyState: 1,
    send: (value: string) => delivered.push(value),
  };
  const otherSocket = {
    readyState: 1,
    send: (value: string) => delivered.push(`other:${value}`),
  };

  chatRealtimeHub.subscribe("chat-a", subscribedSocket);
  chatRealtimeHub.subscribe("chat-b", otherSocket);

  const count = chatRealtimeHub.publish({
    type: "chat.turn.completed",
    chatId: "chat-a",
    turnTraceId: "turn_1",
  });

  chatRealtimeHub.unsubscribe("chat-a", subscribedSocket);
  chatRealtimeHub.unsubscribe("chat-b", otherSocket);

  assert.equal(count, 1);
  assert.equal(delivered.length, 1);
  assert.match(delivered[0] ?? "", /chat.turn.completed/);
  assert.doesNotMatch(delivered[0] ?? "", /^other:/);
});

