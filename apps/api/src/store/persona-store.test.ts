import assert from "node:assert/strict";
import test from "node:test";

import { __internal } from "./persona-store.js";

test("dynamic fallback replies do not expose distill metadata as chat content", () => {
  const answer = __internal.buildDynamicFallbackAnswer({
    mode: "OPEN_ENDED",
    displayName: "进击的巨人里面的艾尔文团长",
    previewIntro: "基于 3 份已审核资料蒸馏出的 进击的巨人里面的艾尔文团长 对象，当前更偏 说话方式、思考方式、价值判断。",
    primaryLens: "说话方式",
    secondaryLens: "思考方式",
    hasBasis: true,
  });

  assert.doesNotMatch(answer, /基于 \d+ 份已审核资料/);
  assert.doesNotMatch(answer, /蒸馏|对象|当前更偏|资料/);
  assert.match(answer, /我/);
});

test("dynamic fallback answers direct name questions naturally", () => {
  const answer = __internal.buildDynamicFallbackAnswer({
    mode: "OPEN_ENDED",
    displayName: "进击的巨人里面的艾尔文团长",
    previewIntro: "基于 3 份已审核资料蒸馏出的 进击的巨人里面的艾尔文团长 对象。",
    primaryLens: "说话方式",
    secondaryLens: "思考方式",
    hasBasis: true,
    userContent: "你的名字叫什么？",
  });

  assert.match(answer, /你可以叫我进击的巨人里面的艾尔文团长/);
  assert.doesNotMatch(answer, /基于|蒸馏|资料|对象/);
});
