import assert from "node:assert/strict";
import test from "node:test";

import { distillToolCallSchema, type DistillToolResult } from "@hall-of-fame/contracts";

import { executeDistillToolStep } from "./runtime-executor.js";
import type { DistillToolContext, DistillToolHandler } from "./tool-registry.js";

const context: DistillToolContext = {
  jobId: "00000000-0000-4000-8000-000000000001",
  actorUserId: "00000000-0000-4000-8000-000000000002",
  personaId: "00000000-0000-4000-8000-000000000003",
  runtimeState: "START",
};

const buildFakeStore = () => {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    store: {
      async recordRejectedDistillPlannerCall(input: Record<string, unknown>) {
        events.push({ type: "plannerRejected", ...input });
        return { id: "00000000-0000-4000-8000-000000000998" };
      },
      async startDistillToolRun(input: Record<string, unknown>) {
        events.push({ type: "start", ...input });
        return { id: "00000000-0000-4000-8000-000000000999" };
      },
      async finishDistillToolRun(input: Record<string, unknown>) {
        events.push({ type: "finish", ...input });
      },
    },
  };
};

const buildHandler = (
  toolName: DistillToolHandler["toolName"],
  result: DistillToolResult,
  onExecute?: () => void,
): DistillToolHandler => ({
  toolName,
  async execute() {
    onExecute?.();
    return result;
  },
});

test("runtime executor runs a legal tool step and records success", async () => {
  const { events, store } = buildFakeStore();
  const call = distillToolCallSchema.parse({
    toolName: "check_distill_intent_risk",
    input: {
      intentId: "00000000-0000-4000-8000-000000000004",
      normalizedName: "纪晓岚",
      entityType: "FICTIONAL_CHARACTER",
      riskDecision: "ALLOW",
      riskReasons: [],
    },
  });
  const handlers = new Map([
    [
      "check_distill_intent_risk" as const,
      buildHandler("check_distill_intent_risk", {
        ok: true,
        stateAfter: "RISK_CHECKED",
        summary: "ok",
        data: {},
      }),
    ],
  ]);

  const result = await executeDistillToolStep({
    seq: 1,
    call,
    context,
    handlers,
    store,
  });

  assert.equal(result.stateAfter, "RISK_CHECKED");
  assert.equal(events.at(-1)?.status, "SUCCEEDED");
  assert.equal(events.at(-1)?.runtimeStateAfter, "RISK_CHECKED");
});

test("runtime executor rejects illegal state order without running the handler", async () => {
  const { events, store } = buildFakeStore();
  let executed = false;
  const call = distillToolCallSchema.parse({
    toolName: "persist_persona_candidate",
    input: {
      idempotencyKey: "job-1",
    },
  });
  const handlers = new Map([
    [
      "persist_persona_candidate" as const,
      buildHandler(
        "persist_persona_candidate",
        {
          ok: true,
          stateAfter: "PERSISTED",
          summary: "persisted",
          data: {},
        },
        () => {
          executed = true;
        },
      ),
    ],
  ]);

  await assert.rejects(
    () =>
      executeDistillToolStep({
        seq: 1,
        call,
        context,
        handlers,
        store,
      }),
    /not allowed/,
  );

  assert.equal(executed, false);
  assert.equal(events.at(-1)?.status, "REJECTED");
});

test("runtime executor rejects handler stateAfter that differs from the state machine", async () => {
  const { events, store } = buildFakeStore();
  const call = distillToolCallSchema.parse({
    toolName: "clean_sources",
    input: {
      maxCharsPerSource: 1200,
      dropLowTrustSources: false,
    },
  });
  const handlers = new Map([
    [
      "clean_sources" as const,
      buildHandler("clean_sources", {
        ok: true,
        stateAfter: "PERSISTED",
        summary: "bad state",
        data: {},
      }),
    ],
  ]);

  await assert.rejects(
    () =>
      executeDistillToolStep({
        seq: 1,
        call,
        context: {
          ...context,
          runtimeState: "SOURCES_COLLECTED",
        },
        handlers,
        store,
      }),
    /expected SOURCES_CLEANED/,
  );

  assert.equal(events.at(-1)?.status, "FAILED");
  assert.equal(events.at(-1)?.runtimeStateAfter, "SOURCES_CLEANED");
  assert.notEqual(events.at(-1)?.runtimeStateAfter, "PERSISTED");
});
