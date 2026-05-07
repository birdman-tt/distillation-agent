import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

import { sendChatMessage } from "@hall-of-fame/api-client";

const h5Source = readFileSync(new URL("./h5-app.ts", import.meta.url), "utf8");

const getPreviewPageSource = () => {
  const start = h5Source.indexOf("const renderPreviewPage");
  const end = h5Source.indexOf("const renderProfilePage", start);

  assert.ok(start >= 0, "expected preview page renderer to exist");
  assert.ok(end > start, "expected preview page renderer to end before profile page renderer");

  return h5Source.slice(start, end);
};

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
  const ensureStart = h5Source.indexOf("const ensureChatId = async () => {");
  const ensureEnd = h5Source.indexOf("const deliverUserBubble", ensureStart);

  assert.ok(ensureStart >= 0, "expected chat script to define ensureChatId");
  assert.ok(ensureEnd > ensureStart, "expected ensureChatId to appear before message delivery");

  const ensureChatBlock = h5Source.slice(ensureStart, ensureEnd);
  const ensureSessionIndex = ensureChatBlock.indexOf("await HallOfFameClient.ensureAnonymousSession();");
  const createSessionIndex = ensureChatBlock.indexOf("chatCreation = ${createChatSessionExpression}");

  assert.ok(ensureSessionIndex >= 0, "expected chat script to ensure an anonymous session");
  assert.ok(createSessionIndex >= 0, "expected chat script to create the persisted chat from the shared expression");
  assert.ok(ensureSessionIndex < createSessionIndex, "expected anonymous session before chat creation");
  assert.match(h5Source, /return HallOfFameClient\.requestJson\("\/v1\/chats", \{/);
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
  const ownedObjectIndex = h5Source.indexOf("if (item.ownedObjectId)");
  const previewIndex = h5Source.indexOf('if (item.targetType === "draft_version_preview")');

  assert.ok(ownedObjectIndex >= 0, "expected history to detect owned object chats");
  assert.ok(previewIndex > ownedObjectIndex, "expected owned object chats to avoid the readonly history fallback");
  assert.match(h5Source, /\/profile\/objects\/" \+ encodeURIComponent\(item\.ownedObjectId\) \+ "\/chat/);
  assert.match(h5Source, /"\/history\/" \+ encodeURIComponent\(item\.id\)/);
  assert.doesNotMatch(h5Source, /appendHistorySource\("\/preview\/" \+ encodeURIComponent\(item\.targetPersonaVersionId\)\)/);
});

test("chat page resumes persisted messages before continuing a history chat", () => {
  assert.match(h5Source, /initialChatId/);
  assert.match(h5Source, /renderExistingMessages/);
  assert.match(h5Source, /requestJson\("\/v1\/chats\/" \+ encodeURIComponent\(initialChatId\)/);
});

test("deleted draft history opens a read-only transcript", () => {
  const bodyStart = h5Source.indexOf("export const buildReadOnlyHistoryChatPageBody");
  const bodyEnd = h5Source.indexOf("const renderFeaturedList", bodyStart);
  assert.ok(bodyStart >= 0, "expected read-only history body builder");
  assert.ok(bodyEnd > bodyStart, "expected read-only history body builder to end before featured list");
  const bodySource = h5Source.slice(bodyStart, bodyEnd);

  assert.match(h5Source, /const renderReadOnlyHistoryChatPage/);
  assert.match(h5Source, /buildReadOnlyHistoryChatPageBody/);
  assert.match(h5Source, /targetType: "history_chat"/);
  assert.match(h5Source, /旧会话只保留记录，不能继续发送。/);
  assert.match(h5Source, /app\.get<\{ Params: \{ chatId: string \} \}>\("\/history\/:chatId"/);
  assert.doesNotMatch(bodySource, /<textarea|data-chat-form|composer-actions/);
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

test("preview compatibility page redirects owned versions to my object detail", () => {
  const previewSource = getPreviewPageSource();

  assert.match(previewSource, /\/v1\/me\/persona-inventory/);
  assert.match(previewSource, /entry\?\.personaVersionId === versionId/);
  assert.match(
    previewSource,
    /window\.location\.replace\("\/profile\/objects\/" \+ encodeURIComponent\(ownedItem\.objectId\)\)/,
  );
  assert.match(previewSource, /window\.location\.replace\(version\.personaHref\)/);
  assert.match(previewSource, /window\.location\.replace\(version\.shareHref\)/);
  assert.doesNotMatch(previewSource, /\/v1\/persona-versions\/" \+ versionId \+ "\/publish/);
  assert.doesNotMatch(previewSource, /data-publish-private/);
  assert.doesNotMatch(previewSource, /data-publish-public/);
  assert.doesNotMatch(previewSource, /submit-publish-review/);
});

test("create page uses one-click distill job flow instead of legacy persona distill", () => {
  assert.match(h5Source, /\/v1\/persona-distill-intents/);
  assert.match(h5Source, /\/v1\/persona-distill-source-discovery/);
  assert.match(h5Source, /\/v1\/persona-distill-source-discovery-jobs\//);
  assert.match(h5Source, /sourceDiscoveryJobId/);
  assert.match(h5Source, /pollSourceDiscoveryJob/);
  assert.match(h5Source, /retrySourceDiscoveryJob/);
  assert.match(h5Source, /data-retry-source-discovery/);
  assert.match(h5Source, /\/v1\/persona-distill-jobs/);
  assert.match(h5Source, /\/v1\/me\/persona-inventory/);
  assert.doesNotMatch(h5Source, /renderDiscovery\(discovery\)/);
  assert.doesNotMatch(h5Source, /\/v1\/personae\/" \+ personaId \+ "\/distill/);
});

test("create page redirects completed distill jobs to my object detail", () => {
  assert.match(h5Source, /const getJobObjectHref = \(job\) =>/);
  assert.match(h5Source, /window\.location\.href = getJobObjectHref\(job\)/);
  assert.doesNotMatch(
    h5Source,
    /window\.location\.href = "\/preview\/" \+ encodeURIComponent\(job\.resultVersionId\)/,
  );
});

test("create form captures form data before awaiting anonymous session", () => {
  const createSubmitBlock = h5Source.match(
    /createForm\?\.addEventListener\("submit", async \(event\) => \{[\s\S]*?await HallOfFameClient\.ensureAnonymousSession\(\);/,
  );

  assert.ok(createSubmitBlock, "expected create form submit handler to exist");

  const block = createSubmitBlock[0];
  const captureIndex = block.indexOf("const form = event.currentTarget;");
  const queryIndex = block.indexOf('new FormData(form).get("query")');
  const guardIndex = block.indexOf("if (isSourceDiscoverySubmitting || createSubmitButton?.disabled)");
  const disableIndex = block.indexOf("setCreateSubmitDisabled(true);");
  const ensureIndex = block.indexOf("await HallOfFameClient.ensureAnonymousSession();");

  assert.ok(captureIndex >= 0, "expected submit handler to capture the form synchronously");
  assert.ok(queryIndex >= 0, "expected submit handler to read form data synchronously");
  assert.ok(guardIndex >= 0, "expected submit handler to guard duplicate submissions before awaiting");
  assert.ok(disableIndex >= 0, "expected submit handler to disable submit before awaiting");
  assert.ok(ensureIndex >= 0, "expected submit handler to still ensure an anonymous session");
  assert.ok(captureIndex < ensureIndex, "expected form capture before the first await");
  assert.ok(queryIndex < ensureIndex, "expected form data read before the first await");
  assert.ok(guardIndex < ensureIndex, "expected duplicate submit guard before the first await");
  assert.ok(disableIndex < ensureIndex, "expected submit disable before the first await");
});

test("create source discovery failure UI hides internal provider details", () => {
  const renderStart = h5Source.indexOf("const renderSourceDiscoveryJob = (job) => {");
  const renderEnd = h5Source.indexOf("const loadSourceDiscoveryJob", renderStart);
  assert.ok(renderStart >= 0, "expected source discovery job renderer");
  assert.ok(renderEnd > renderStart, "expected renderer to end before loader");

  const renderBlock = h5Source.slice(renderStart, renderEnd);
  assert.doesNotMatch(renderBlock, /Kimi|429|engine overloaded|tool_calls|trace/i);
  assert.match(renderBlock, /job\.error\?\.message/);
  assert.match(renderBlock, /资料搜索失败，可以重试/);

  const pollStart = h5Source.indexOf("const pollSourceDiscoveryJob = async () => {");
  const pollEnd = h5Source.indexOf("const retrySourceDiscoveryJob", pollStart);
  assert.ok(pollStart >= 0, "expected source discovery polling function");
  assert.ok(pollEnd > pollStart, "expected polling function to end before retry function");

  const pollBlock = h5Source.slice(pollStart, pollEnd);
  assert.match(pollBlock, /资料搜索暂时不可用，正在重试。/);
  assert.match(pollBlock, /console\.warn\("source discovery poll failed", error\)/);
  assert.doesNotMatch(pollBlock, /error instanceof Error \? error\.message/);
});

test("create source forms do not use event currentTarget after awaits", () => {
  assert.doesNotMatch(h5Source, /event\.currentTarget\.reset\(\)/);
  assert.match(h5Source, /const textSourceForm = event\.currentTarget;/);
  assert.match(h5Source, /textSourceForm\.reset\(\)/);
  assert.match(h5Source, /const urlSourceForm = event\.currentTarget;/);
  assert.match(h5Source, /urlSourceForm\.reset\(\)/);
});

test("create page supports adding sources from an already completed distill job", () => {
  assert.match(h5Source, /const shouldAddSources = createParams\.get\("mode"\) === "addSources"/);
  assert.match(h5Source, /job\?\.status === "SUCCEEDED" && shouldAddSources/);
  assert.match(h5Source, /可以补充资料后重新蒸馏。/);
  assert.match(h5Source, /version\.addSourcesHref/);

  const initialJobLoadBlock = h5Source.match(
    /void HallOfFameClient\.ensureAnonymousSession\(\)\.then\(async \(\) => \{[\s\S]*?\n      \}\);\n    `/,
  );
  assert.ok(initialJobLoadBlock, "expected create initial job load block to exist");

  const initialBlock = initialJobLoadBlock[0];
  const addSourcesIndex = initialBlock.indexOf('job?.status === "SUCCEEDED" && shouldAddSources');
  const successRedirectIndex = initialBlock.indexOf("window.location.href = getJobObjectHref(job)");

  assert.ok(addSourcesIndex >= 0, "expected completed add-sources branch");
  assert.ok(successRedirectIndex >= 0, "expected completed job object redirect branch");
  assert.ok(addSourcesIndex < successRedirectIndex, "expected add-sources branch before success redirect");
});

test("create page gates distill trace logs behind explicit debug mode", () => {
  assert.match(h5Source, /data-distill-debug-panel/);
  assert.match(h5Source, /hof-distill-debug/);
  assert.match(h5Source, /debug=distill/);
  assert.match(h5Source, /const shouldShowDistillDebug = \(\) =>/);
  assert.match(h5Source, /\/v1\/persona-distill-jobs\/" \+ encodeURIComponent\(jobId\) \+ "\/trace"/);
  assert.match(h5Source, /loadDistillTrace/);
  assert.match(h5Source, /renderDistillTrace/);
});

test("preview page hides internal quality gate details", () => {
  const previewSource = getPreviewPageSource();

  assert.doesNotMatch(previewSource, /version\.coverageScore/);
  assert.doesNotMatch(previewSource, /version\.styleScore/);
  assert.doesNotMatch(previewSource, /version\.publishGate/);
  assert.doesNotMatch(previewSource, /version\.sourceDistillJobId/);
  assert.doesNotMatch(previewSource, /data-quality-title/);
  assert.doesNotMatch(previewSource, /data-quality-copy/);
  assert.doesNotMatch(previewSource, /data-preview-questions/);
  assert.doesNotMatch(previewSource, /data-preview-answers/);
  assert.doesNotMatch(previewSource, /预览聊天|推荐问题|示例回答/);
});

test("my objects pages render inventory and object management without version actions", () => {
  assert.match(h5Source, /const renderObjectGroups/);
  assert.match(h5Source, /data-inventory-group/);
  assert.match(h5Source, /groups\?\.creating/);
  assert.match(h5Source, /needsAttention/);
  assert.match(h5Source, /groups\?\.ready/);
  assert.match(h5Source, /public/);
  assert.match(h5Source, /item\.status/);
  assert.match(h5Source, /object\.availableActions/);
  assert.match(h5Source, /\/v1\/me\/objects\/" \+ encodeURIComponent\(objectId\)/);
  assert.match(h5Source, /\/confirm"/);
  assert.match(h5Source, /\/publish"/);
  assert.match(h5Source, /method: "DELETE"/);
  assert.match(h5Source, /method: "PATCH"/);
  assert.match(h5Source, /targetType: "owned_object"/);
  assert.match(h5Source, /created\) => created\.chatId/);
  assert.doesNotMatch(h5Source, /item\.displayStatus/);
  assert.doesNotMatch(h5Source, /item\.secondaryActions/);
  assert.doesNotMatch(h5Source, /item\.qualitySummary/);
  assert.doesNotMatch(h5Source, /data-confirm-version|data-discard-version/);
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
