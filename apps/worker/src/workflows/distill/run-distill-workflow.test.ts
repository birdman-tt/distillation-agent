import assert from "node:assert/strict";
import test from "node:test";

import { runDistillWorkflow } from "./run-distill-workflow.js";

test("deterministic distill fallback writes user-facing persona copy, not product metadata", () => {
  const output = runDistillWorkflow({
    displayName: "进击的巨人里面的艾尔文团长",
    distillFocus: ["说话方式", "思考方式", "价值判断"],
    approvedSources: [
      {
        sourceId: "source-1",
        sourceKind: "PRIMARY",
        title: "source",
        summary: "summary",
      },
    ],
  });

  const visibleCopy = [
    output.profile.summary,
    output.preview.previewIntro,
    ...output.preview.sampleAnswers,
  ].join("\n");

  assert.doesNotMatch(visibleCopy, /基于 \d+ 份已审核资料/);
  assert.doesNotMatch(visibleCopy, /蒸馏|对象，当前更偏|当前对象/);
});
