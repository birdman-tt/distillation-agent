import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCreatePageBody,
  buildFeaturedListBody,
  buildHistoryPageBody,
  buildMyObjectChatPageBody,
  buildMyObjectDetailPageBody,
  buildMyObjectsPageBody,
  buildPersonaPageBody,
  buildProfilePageBody,
  buildReplyInspectorHtml,
  renderMyObjectChatPage,
} from "./h5-app.js";

const extractLastInlineScript = (html: string) => {
  const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g));
  return scripts.at(-1)?.[1] ?? "";
};

test("reply inspector hides raw system adjudication wording by default", () => {
  const markup = buildReplyInspectorHtml({
    basisSummary: {
      mode: "INFERRED",
      summary: "这段回答主要沿着人物画像中的判断框架展开。",
    },
    conflictDetected: false,
  });

  assert.doesNotMatch(markup, /推断级别/);
  assert.match(markup, /回答依据/);
  assert.match(markup, /人物画像中的判断框架/);
});

test("home shell uses a bottom shuttle nav instead of top pills", () => {
  const body = buildFeaturedListBody([
    {
      id: "persona-1",
      displayName: "苏轼",
      previewIntro: "今夜你会先把什么说出口？",
      recommendedQuestions: [],
      originType: "OFFICIAL",
    },
  ]);

  assert.match(body, /bottom-shuttle/);
  assert.match(body, /shuttle-track/);
  assert.match(body, />聊天</);
  assert.match(body, />列表</);
  assert.match(body, />创建</);
  assert.match(body, />我的</);
  assert.match(body, /class="shuttle-item is-active" href="\/"/);
  assert.doesNotMatch(body, />审核</);
  assert.doesNotMatch(body, /share\/demo/);
  assert.doesNotMatch(body, /top-nav|nav-link/);
});

test("home shell keeps only one short slogan above the fold", () => {
  const body = buildFeaturedListBody([
    {
      id: "persona-1",
      displayName: "苏轼",
      previewIntro: "今夜你会先把什么说出口？",
      recommendedQuestions: [],
      originType: "OFFICIAL",
    },
  ]);

  assert.match(body, /只差一句开场/);
  assert.doesNotMatch(body, /产品说明|进入人物馆|进入对话预览/);
});

test("home page centers one persona carousel card with side peeks", () => {
  const body = buildFeaturedListBody([
    {
      id: "persona-1",
      displayName: "苏轼",
      previewIntro: "今夜你会先把什么说出口？",
      recommendedQuestions: [],
      originType: "OFFICIAL",
    },
    {
      id: "persona-2",
      displayName: "诸葛亮",
      previewIntro: "换个角度先把局面看清。",
      recommendedQuestions: [],
      originType: "OFFICIAL",
    },
  ]);

  assert.match(body, /persona-carousel/);
  assert.match(body, /data-carousel-viewport/);
  assert.match(body, /carousel-card is-current/);
  assert.match(body, /data-carousel-dot/);
  assert.doesNotMatch(body, /persona-topline|prompt-cluster|question-slip|persona-card/);
});

test("persona page behaves like a messaging thread", () => {
  const body = buildPersonaPageBody({
    persona: {
      displayName: "苏轼",
      currentPublishedVersionId: "version-1",
      originType: "OFFICIAL",
    },
    version: {
      previewIntro: "在失意与豁达之间找到生命张力的文人。",
      recommendedQuestions: ["人处在低谷时，怎么和自己相处？", "理想与现实总冲突，怎么办？"],
      sampleAnswers: ["先安顿自己，再安顿世界。"],
    },
  });

  assert.doesNotMatch(body, /<header class="thread-header">/);
  assert.match(body, /data-thread-name/);
  assert.match(body, /thread-status/);
  assert.match(body, /message-list/);
  assert.match(body, /composer/);
  assert.doesNotMatch(body, /data-suggested-question=|人物气质|回答样本|prompt-cluster/);
});

test("persona page can return to the history list when opened from history", () => {
  const body = buildPersonaPageBody(
    {
      persona: {
        displayName: "苏轼",
        currentPublishedVersionId: "version-1",
        originType: "OFFICIAL",
      },
      version: {
        previewIntro: "在失意与豁达之间找到生命张力的文人。",
        recommendedQuestions: [],
        sampleAnswers: [],
      },
    },
    { returnHref: "/history" },
  );

  assert.match(body, /href="\/history">返回/);
});

test("history page renders as a single chat list tab", () => {
  const body = buildHistoryPageBody({
    items: [
      {
        id: "history-1",
        displayName: "秦始皇",
        lastMessage: "如果局面失控，先稳住哪里？",
        updatedAtLabel: "刚刚",
        href: "/persona/history-1",
      },
      {
        id: "history-2",
        displayName: "苏轼",
        lastMessage: "继续从上次的话题接着聊。",
        updatedAtLabel: "上周",
        href: "/persona/history-2",
      },
    ],
  });

  assert.match(body, /聊天列表/);
  assert.match(body, /之前聊过的对象，都在这里/);
  assert.match(body, /history-item/);
  assert.match(body, /history-snippet/);
  assert.match(body, /刚刚/);
  assert.match(body, />聊天</);
  assert.match(body, />列表</);
  assert.match(body, /href="\/history"/);
  assert.match(body, /class="shuttle-item is-active" href="\/history"/);
  assert.doesNotMatch(body, /最近开口|历史记录|继续聊|返回聊天/);
});

test("supporting pages inherit the same dark-chat shell", () => {
  const createPage = buildCreatePageBody();
  const profilePage = buildProfilePageBody();

  assert.match(createPage, /bottom-shuttle/);
  assert.match(createPage, /对象名称/);
  assert.match(createPage, /资料确认/);
  assert.match(createPage, /data-start-distill/);
  assert.match(createPage, /data-create-success/);
  assert.match(createPage, /data-create-workbench/);
  assert.doesNotMatch(createPage, /top-nav|Step 1|share\/demo/);

  assert.doesNotMatch(profilePage, /审核入口|最近对象/);
  assert.match(profilePage, /href="\/profile\/objects"/);
  assert.match(profilePage, /href="\/history"/);
  assert.match(profilePage, /href="\/create"/);
  assert.doesNotMatch(profilePage, /data-profile-persona-list|data-profile-draft-count|data-profile-published-count/);
  assert.doesNotMatch(profilePage, /主题切换|data-theme-state|data-theme-choice|>浅色<|>深色</);
});

test("my objects page renders as the object list entry", () => {
  const body = buildMyObjectsPageBody();

  assert.match(body, /我的对象/);
  assert.match(body, /data-my-objects-list/);
  assert.match(body, /进入对象详情后再管理/);
  assert.match(body, /class="shuttle-item is-active" href="\/profile"/);
  assert.doesNotMatch(body, /data-my-object-actions|data-profile-persona-list/);
});

test("my object detail page renders the management surface", () => {
  const body = buildMyObjectDetailPageBody("object-1");

  assert.match(body, /data-my-object-detail/);
  assert.match(body, /data-my-object-actions/);
  assert.match(body, /data-my-object-edit-form/);
  assert.match(body, /返回列表/);
  assert.doesNotMatch(body, /quality|coverage|publishGate/);
});

test("my object chat page is pure chat", () => {
  const body = buildMyObjectChatPageBody("object-1");

  assert.match(body, /data-chat-form/);
  assert.match(body, /href="\/profile\/objects\/object-1">返回/);
  assert.match(body, /data-my-object-chat/);
  assert.doesNotMatch(body, /data-my-object-actions|data-my-object-edit-form|补资料|公开分享|删除/);
});

test("my object chat page inline script is syntactically valid", () => {
  const chatId = "11111111-1111-4111-8111-111111111111";
  const html = renderMyObjectChatPage("object-1", { chatId });
  const script = extractLastInlineScript(html);

  assert.match(script, new RegExp(`const initialChatId = "${chatId}"`));
  assert.doesNotThrow(() => new Function(script));
});
