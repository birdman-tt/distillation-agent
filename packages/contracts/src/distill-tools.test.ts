import assert from "node:assert/strict";
import test from "node:test";

import {
  distillToolCallSchema,
  distillToolNameSchema,
  distillToolResultSchema,
} from "./distill-tools.js";

test("distill tool schemas parse legal tool calls", () => {
  const parsed = distillToolCallSchema.parse({
    toolName: "score_source_coverage",
    input: {
      minimumSources: 3,
      minimumBuckets: 2,
    },
  });

  assert.equal(parsed.toolName, "score_source_coverage");
});

test("distill tool schemas reject unknown tool names", () => {
  assert.throws(
    () =>
      distillToolCallSchema.parse({
        toolName: "drop_all_tables",
        input: {},
      }),
    /Invalid|invalid|No matching discriminator/,
  );
});

test("distill tool result schema keeps trace summaries bounded", () => {
  assert.throws(
    () =>
      distillToolResultSchema.parse({
        ok: true,
        stateAfter: "SOURCES_CLEANED",
        summary: "x".repeat(1001),
        data: {},
      }),
    /Too big|too_big|1000/,
  );
});

test("distill tool name schema defines the expected runtime surface", () => {
  assert.deepEqual(distillToolNameSchema.options, [
    "check_distill_intent_risk",
    "search_sources",
    "clean_sources",
    "extract_evidence",
    "score_source_coverage",
    "generate_persona_profile",
    "validate_persona_profile",
    "persist_persona_candidate",
    "mark_job_needs_sources",
    "mark_job_failed",
  ]);
});
