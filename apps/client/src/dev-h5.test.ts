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

test("home page reads like a mobile-first persona hall instead of a plain card grid", () => {
  const body = buildFeaturedListBody([
    {
      id: "persona-1",
      displayName: "苏轼",
      previewIntro: "在失意与豁达之间找到生命张力的文人。",
      recommendedQuestions: ["人处在低谷时，怎么和自己相处？"],
      originType: "OFFICIAL",
    },
  ]);

  assert.match(body, /bubble assistant/);
  assert.match(body, /进入对话/);
  assert.doesNotMatch(body, /今夜先从这里开始|先从一句问题开始|Step 1|Chat-first entry|每张人物卡只保留最值得开口的线索|Curated Personas/);
});

test("persona page surfaces suggested prompts as tap-friendly chat starters", () => {
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

  assert.match(body, /bubble assistant/);
  assert.match(body, /bubble user/);
  assert.match(body, /data-suggested-question=/);
  assert.match(body, /发送问题/);
  assert.doesNotMatch(body, /人物气质|回答样本|Chat-first persona|先让苏轼开口/);
});

test("creation and review flows keep the same warm editorial product language", () => {
  const createPage = buildCreatePageBody();
  const reviewPage = buildReviewPageBody();

  assert.match(createPage, /资料簿/);
  assert.match(createPage, /先给这个人格一个名字/);
  assert.doesNotMatch(createPage, /Step 1|Step 2/);
  assert.match(reviewPage, /待审发布/);
  assert.doesNotMatch(reviewPage, /Reviewer session|Source review|Publish review/);
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
