import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCreatePageBody,
  buildFeaturedListBody,
  buildPersonaPageBody,
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
  assert.match(markup, /这句话怎么来的/);
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
  ]);

  assert.match(body, /persona-carousel/);
  assert.match(body, /carousel-viewport/);
  assert.match(body, /carousel-card is-current/);
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

  assert.match(createPage, /bottom-shuttle/);
  assert.match(createPage, /quiet-panel|composer-shell/);
  assert.doesNotMatch(createPage, /hero|top-nav|Step 1/);

  assert.match(reviewPage, /bottom-shuttle/);
  assert.doesNotMatch(reviewPage, /hero|section-label|Source review/);
});

test("session banner keeps auth state human and hides raw technical identifiers", () => {
  const anonymous = buildSessionBannerHtml({
    role: "ANONYMOUS",
    sessionKind: "ANONYMOUS",
    userId: "12345678-aaaa-bbbb-cccc-1234567890ab",
  });

  assert.match(anonymous, /匿名会话已就绪/);
  assert.doesNotMatch(anonymous, /ANONYMOUS|12345678|user/);
});
