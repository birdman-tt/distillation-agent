import assert from "node:assert/strict";
import test from "node:test";

import { distillToolNameSchema } from "@hall-of-fame/contracts";

import {
  buildDistillToolRegistry,
  getDistillToolHandler,
} from "./tool-registry.js";

const context = {
  jobId: "00000000-0000-4000-8000-000000000001",
  actorUserId: "00000000-0000-4000-8000-000000000002",
  personaId: "00000000-0000-4000-8000-000000000003",
  runtimeState: "START" as const,
};

test("distill tool registry covers every contract tool name", () => {
  const registry = buildDistillToolRegistry();
  assert.deepEqual([...registry.keys()], distillToolNameSchema.options);
});

test("distill tool registry handlers parse input through the contract schema", async () => {
  const handler = getDistillToolHandler("check_distill_intent_risk");
  assert.ok(handler);

  await assert.rejects(
    () => handler.execute({ intentId: "not-a-uuid" }, context),
    /Invalid|invalid|uuid/,
  );

  const result = await handler.execute(
    {
      intentId: "00000000-0000-4000-8000-000000000004",
      normalizedName: "纪晓岚",
      entityType: "FICTIONAL_CHARACTER",
      riskDecision: "ALLOW",
      riskReasons: [],
    },
    context,
  );

  assert.equal(result.stateAfter, "RISK_CHECKED");
});

test("distill tool registry does not return unknown tools", () => {
  assert.equal(getDistillToolHandler("drop_all_tables"), null);
});
