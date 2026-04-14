import assert from "node:assert/strict";
import test from "node:test";

import { buildCreatePageBody, buildFeaturedListBody, buildPersonaPageBody, buildReplyInspectorHtml, buildReviewPageBody } from "./h5-app.js";

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

  assert.match(body, /今夜先从这里开始/);
  assert.match(body, /进入对话/);
  assert.doesNotMatch(body, /Step 1|Chat-first entry|每张人物卡只保留最值得开口的线索|Curated Personas/);
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
  assert.match(body, /和苏轼聊聊/);
  assert.doesNotMatch(body, /人物气质|回答样本|Chat-first persona/);
});

test("creation and review flows keep the same warm editorial product language", () => {
  const createPage = buildCreatePageBody();
  const reviewPage = buildReviewPageBody();

  assert.match(createPage, /Source notebook/);
  assert.match(createPage, /先给这个人格一个名字/);
  assert.match(reviewPage, /Reviewer session/);
  assert.match(reviewPage, /发布审核/);
});
