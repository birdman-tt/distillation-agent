import assert from "node:assert/strict";
import test from "node:test";

import { distillToolCallSchema, type DistillRuntimeState, type DistillToolCall } from "@hall-of-fame/contracts";

import {
  DistillPlannerToolCallParseError,
  buildDeterministicDistillPlanner,
  type DistillPlanner,
  type DistillPlannerInput,
  type DistillPlannerJobContext,
  type DistillToolMemorySnapshot,
} from "./distill-planner.js";
import { runDistillToolLoop } from "./tool-loop.js";
import { buildDistillToolRegistry, type DistillToolHandler } from "./tool-registry.js";

const job: DistillPlannerJobContext = {
  jobId: "00000000-0000-4000-8000-000000000001",
  intentId: "00000000-0000-4000-8000-000000000002",
  discoveryId: "00000000-0000-4000-8000-000000000003",
  actorUserId: "00000000-0000-4000-8000-000000000004",
  personaId: "00000000-0000-4000-8000-000000000005",
  runtimeState: "START",
  normalizedName: "纪晓岚",
  displayName: "纪晓岚",
  entityType: "FICTIONAL_CHARACTER",
  riskDecision: "ALLOW",
  riskReasons: [],
  selectedSourceCandidateIds: [],
  selectedExtraSourceIds: [],
};

const context = {
  jobId: job.jobId,
  actorUserId: job.actorUserId,
  personaId: job.personaId,
};

const memory = (overrides: Partial<DistillToolMemorySnapshot> = {}): DistillToolMemorySnapshot => ({
  candidateCount: 3,
  usableCandidateCount: 3,
  approvedSourceCount: 3,
  coverageMissingRequirements: [],
  validationMissingRequirements: [],
  hasGeneratedProfile: true,
  persistedVersionId: null,
  ...overrides,
});

const buildFakeStore = () => {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    store: {
      async recordRejectedDistillPlannerCall(input: Record<string, unknown>) {
        events.push({ type: "plannerRejected", ...input });
        return { id: "00000000-0000-4000-8000-000000000900" };
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

const call = (toolName: DistillToolCall["toolName"], input: unknown): DistillToolCall =>
  distillToolCallSchema.parse({ toolName, input });

const sequencePlanner = (build: (state: DistillRuntimeState, input: DistillPlannerInput) => DistillToolCall): DistillPlanner => ({
  async nextToolCall(input) {
    return build(input.runtimeState, input);
  },
});

test("distill tool loop completes the deterministic happy path", async () => {
  const { events, store } = buildFakeStore();

  const result = await runDistillToolLoop({
    job,
    context,
    planner: buildDeterministicDistillPlanner(),
    handlers: buildDistillToolRegistry(),
    getMemorySnapshot: () => memory(),
    store: store as any,
  });

  assert.equal(result.status, "succeeded");
  assert.equal(result.runtimeState, "PERSISTED");
  assert.equal(result.toolResults.at(-1)?.toolName, "persist_persona_candidate");
  assert.equal(events.some((event) => event.type === "plannerRejected"), false);
});

test("distill tool loop marks failed when max tool calls are exceeded", async () => {
  const { events, store } = buildFakeStore();

  const result = await runDistillToolLoop({
    job,
    context,
    planner: buildDeterministicDistillPlanner(),
    handlers: buildDistillToolRegistry(),
    getMemorySnapshot: () => memory(),
    maxToolCalls: 1,
    store: store as any,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.runtimeState, "FAILED");
  assert.equal(events.some((event) => event.toolName === "mark_job_failed" && event.type === "start"), true);
});

test("distill tool loop rejects illegal order and does not execute persist handler", async () => {
  const { store } = buildFakeStore();
  let persistExecuted = false;
  const handlers = new Map(buildDistillToolRegistry());
  handlers.set("persist_persona_candidate", {
    toolName: "persist_persona_candidate",
    async execute() {
      persistExecuted = true;
      return {
        ok: true,
        stateAfter: "PERSISTED",
        summary: "persisted",
        data: {},
      };
    },
  } satisfies DistillToolHandler);

  const result = await runDistillToolLoop({
    job,
    context,
    planner: sequencePlanner(() => call("persist_persona_candidate", { idempotencyKey: "bad" })),
    handlers,
    getMemorySnapshot: () => memory(),
    store: store as any,
  });

  assert.equal(result.status, "failed");
  assert.equal(persistExecuted, false);
});

test("distill tool loop records invalid planner tool calls and fails safely", async () => {
  const { events, store } = buildFakeStore();

  const result = await runDistillToolLoop({
    job,
    context,
    planner: {
      async nextToolCall() {
        throw new DistillPlannerToolCallParseError({
          message: "unknown tool",
          rawToolName: "drop_database",
          rawArguments: { sql: "drop table users" },
        });
      },
    },
    handlers: buildDistillToolRegistry(),
    getMemorySnapshot: () => memory(),
    store: store as any,
  });

  assert.equal(result.status, "failed");
  assert.equal(events.some((event) => event.type === "plannerRejected" && event.rawToolName === "drop_database"), true);
});

test("distill tool loop can finish in needs sources state", async () => {
  const { store } = buildFakeStore();
  const planner = sequencePlanner((state) => {
    switch (state) {
      case "START":
        return call("check_distill_intent_risk", {
          intentId: job.intentId,
          normalizedName: job.normalizedName,
          entityType: job.entityType,
          riskDecision: job.riskDecision,
          riskReasons: job.riskReasons,
        });
      case "RISK_CHECKED":
        return call("search_sources", {
          discoveryId: job.discoveryId,
          selectedSourceCandidateIds: [],
          selectedExtraSourceIds: [],
        });
      case "SOURCES_COLLECTED":
        return call("clean_sources", {
          maxCharsPerSource: 1200,
          dropLowTrustSources: false,
        });
      case "SOURCES_CLEANED":
        return call("extract_evidence", {
          buckets: [],
          maxEvidencePerBucket: 4,
        });
      case "EVIDENCE_EXTRACTED":
        return call("score_source_coverage", {
          minimumSources: 3,
          minimumBuckets: 2,
        });
      case "COVERAGE_SCORED":
        return call("mark_job_needs_sources", {
          missingRequirements: ["至少需要 3 条可用资料"],
          userMessage: "资料还不够，需要再补充一些可用资料。",
        });
      default:
        return call("mark_job_failed", {
          code: "unexpected_state",
          message: "unexpected state",
          retryable: false,
        });
    }
  });

  const result = await runDistillToolLoop({
    job,
    context,
    planner,
    handlers: buildDistillToolRegistry(),
    getMemorySnapshot: () => memory({ coverageMissingRequirements: ["至少需要 3 条可用资料"] }),
    store: store as any,
  });

  assert.equal(result.status, "needs_more_sources");
  assert.equal(result.runtimeState, "NEEDS_SOURCES");
});

test("distill tool loop rejects premature needs-sources terminal before handler execution", async () => {
  const { store } = buildFakeStore();
  let needsSourcesExecuted = false;
  let failureWasSystemControlled = false;
  const handlers = new Map(buildDistillToolRegistry());
  handlers.set("mark_job_needs_sources", {
    toolName: "mark_job_needs_sources",
    async execute() {
      needsSourcesExecuted = true;
      return {
        ok: true,
        stateAfter: "NEEDS_SOURCES",
        summary: "should not execute",
        data: {},
      };
    },
  } satisfies DistillToolHandler);
  handlers.set("mark_job_failed", {
    toolName: "mark_job_failed",
    async execute(_input, context) {
      failureWasSystemControlled = context.allowSystemFailure === true;
      return {
        ok: false,
        stateAfter: "FAILED",
        summary: "system failed",
        data: {},
      };
    },
  } satisfies DistillToolHandler);

  const result = await runDistillToolLoop({
    job,
    context,
    planner: sequencePlanner((state) => {
      if (state === "START") {
        return call("check_distill_intent_risk", {
          intentId: job.intentId,
          normalizedName: job.normalizedName,
          entityType: job.entityType,
          riskDecision: job.riskDecision,
          riskReasons: job.riskReasons,
        });
      }
      return call("mark_job_needs_sources", {
        missingRequirements: ["planner controlled text"],
        userMessage: "planner controlled user message",
      });
    }),
    handlers,
    getMemorySnapshot: () => memory(),
    store: store as any,
  });

  assert.equal(result.status, "failed");
  assert.equal(needsSourcesExecuted, false);
  assert.equal(failureWasSystemControlled, true);
});

test("distill tool loop converts planner-requested failure into system-controlled failure", async () => {
  const { store } = buildFakeStore();
  let directPlannerFailureExecuted = false;
  let failureInput: unknown = null;
  let failureWasSystemControlled = false;
  const handlers = new Map(buildDistillToolRegistry());
  handlers.set("mark_job_failed", {
    toolName: "mark_job_failed",
    async execute(input, context) {
      directPlannerFailureExecuted = context.allowSystemFailure !== true;
      failureWasSystemControlled = context.allowSystemFailure === true;
      failureInput = input;
      return {
        ok: false,
        stateAfter: "FAILED",
        summary: "system failed",
        data: {},
      };
    },
  } satisfies DistillToolHandler);

  const result = await runDistillToolLoop({
    job,
    context,
    planner: sequencePlanner(() =>
      call("mark_job_failed", {
        code: "MODEL_CONTROLLED_FAILURE",
        message: "show this model text to the user",
        retryable: false,
      }),
    ),
    handlers,
    getMemorySnapshot: () => memory(),
    store: store as any,
  });

  assert.equal(result.status, "failed");
  assert.equal(directPlannerFailureExecuted, false);
  assert.equal(failureWasSystemControlled, true);
  assert.notEqual((failureInput as { message?: string }).message, "show this model text to the user");
});
