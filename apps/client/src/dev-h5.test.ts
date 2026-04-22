import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCreatePageBody,
  buildFeaturedListBody,
  buildPersonaPageBody,
  buildProfilePageBody,
  buildReplyInspectorHtml,
  buildReviewPageBody,
  buildSessionBannerHtml,
} from "./h5-app.js";

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
  assert.match(body, />创建</);
  assert.match(body, />我的</);
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

  assert.match(body, /thread-header/);
  assert.match(body, /thread-status/);
  assert.match(body, /message-list/);
  assert.match(body, /composer/);
  assert.doesNotMatch(body, /data-suggested-question=|人物气质|回答样本|prompt-cluster/);
});

test("supporting pages inherit the same dark-chat shell", () => {
  const createPage = buildCreatePageBody();
  const reviewPage = buildReviewPageBody();
  const profilePage = buildProfilePageBody();

  assert.match(createPage, /bottom-shuttle/);
  assert.match(createPage, /一句话简介/);
  assert.match(createPage, /风格/);
  assert.match(createPage, /data-create-success/);
  assert.match(createPage, /data-create-workbench/);
  assert.doesNotMatch(createPage, /top-nav|Step 1|share\/demo/);

  assert.match(reviewPage, /bottom-shuttle/);
  assert.doesNotMatch(reviewPage, />审核</);
  assert.doesNotMatch(reviewPage, /share\/demo/);

  assert.match(profilePage, /切换亮暗模式/);
  assert.doesNotMatch(profilePage, /审核入口/);
  assert.match(profilePage, /data-profile-persona-name/);
  assert.doesNotMatch(profilePage, /主题切换|data-theme-state|data-theme-choice|>浅色<|>深色</);
});

test("session banner keeps auth state human and hides raw technical identifiers", () => {
  const anonymous = buildSessionBannerHtml({
    role: "ANONYMOUS",
    sessionKind: "ANONYMOUS",
    userId: "12345678-aaaa-bbbb-cccc-1234567890ab",
  });

  assert.match(anonymous, /已进入匿名体验/);
  assert.doesNotMatch(anonymous, /ANONYMOUS|12345678|user/);
});
