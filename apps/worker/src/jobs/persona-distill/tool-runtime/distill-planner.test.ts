import assert from "node:assert/strict";
import test from "node:test";

import {
  distillToolCallSchema,
  type DistillRuntimeState,
} from "@hall-of-fame/contracts";

import {
  DistillPlannerNoToolCallError,
  DistillPlannerToolCallParseError,
  buildDeterministicDistillPlanner,
  buildMiniMaxDistillPlanner,
  type DistillPlannerInput,
} from "./distill-planner.js";

const baseInput = (runtimeState: DistillRuntimeState, overrides: Partial<DistillPlannerInput> = {}): DistillPlannerInput => ({
  jobId: "00000000-0000-4000-8000-000000000001",
  intentId: "00000000-0000-4000-8000-000000000002",
  discoveryId: "00000000-0000-4000-8000-000000000003",
  actorUserId: "00000000-0000-4000-8000-000000000004",
  personaId: "00000000-0000-4000-8000-000000000005",
  runtimeState,
  normalizedName: "纪晓岚",
  displayName: "纪晓岚",
  entityType: "FICTIONAL_CHARACTER",
  riskDecision: "ALLOW",
  riskReasons: [],
  selectedSourceCandidateIds: ["00000000-0000-4000-8000-000000000006"],
  selectedExtraSourceIds: ["00000000-0000-4000-8000-000000000007"],
  toolResults: [],
  memory: {
    candidateCount: 0,
    usableCandidateCount: 0,
    approvedSourceCount: 0,
    coverageMissingRequirements: [],
    validationMissingRequirements: [],
    hasGeneratedProfile: false,
    persistedVersionId: null,
  },
  ...overrides,
});

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

test("deterministic distill planner builds the risk check tool call from trusted job context", async () => {
  const planner = buildDeterministicDistillPlanner();

  const call = await planner.nextToolCall(baseInput("START"));

  assert.equal(call.toolName, "check_distill_intent_risk");
  assert.deepEqual(call.input, {
    intentId: "00000000-0000-4000-8000-000000000002",
    normalizedName: "纪晓岚",
    entityType: "FICTIONAL_CHARACTER",
    riskDecision: "ALLOW",
    riskReasons: [],
  });
  assert.equal(distillToolCallSchema.safeParse(call).success, true);
});

test("deterministic distill planner builds the source search tool call from trusted job context", async () => {
  const planner = buildDeterministicDistillPlanner();

  const call = await planner.nextToolCall(baseInput("RISK_CHECKED"));

  assert.equal(call.toolName, "search_sources");
  assert.deepEqual(call.input, {
    discoveryId: "00000000-0000-4000-8000-000000000003",
    selectedSourceCandidateIds: ["00000000-0000-4000-8000-000000000006"],
    selectedExtraSourceIds: ["00000000-0000-4000-8000-000000000007"],
  });
  assert.equal(distillToolCallSchema.safeParse(call).success, true);
});

test("deterministic distill planner routes coverage and validation gaps to needs sources", async () => {
  const planner = buildDeterministicDistillPlanner();

  const coverageCall = await planner.nextToolCall(
    baseInput("COVERAGE_SCORED", {
      memory: {
        ...baseInput("COVERAGE_SCORED").memory,
        coverageMissingRequirements: ["至少需要 3 条可用资料"],
      },
    }),
  );
  assert.equal(coverageCall.toolName, "mark_job_needs_sources");
  assert.deepEqual(coverageCall.input.missingRequirements, ["至少需要 3 条可用资料"]);

  const validationCall = await planner.nextToolCall(
    baseInput("PROFILE_VALIDATED", {
      memory: {
        ...baseInput("PROFILE_VALIDATED").memory,
        validationMissingRequirements: ["证据支撑不足"],
      },
    }),
  );
  assert.equal(validationCall.toolName, "mark_job_needs_sources");
  assert.deepEqual(validationCall.input.missingRequirements, ["证据支撑不足"]);
});

test("MiniMax distill planner parses a legal tool call", async () => {
  const planner = buildMiniMaxDistillPlanner({
    apiKey: "minimax-key",
    model: "MiniMax-M2.7",
    fetchFn: async () =>
      jsonResponse({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "validate_persona_profile",
                    arguments: JSON.stringify({ strictness: "preview" }),
                  },
                },
              ],
            },
          },
        ],
      }),
  });

  const call = await planner.nextToolCall(baseInput("PROFILE_GENERATED"));

  assert.equal(call.toolName, "validate_persona_profile");
  assert.deepEqual(call.input, { strictness: "preview" });
});

test("MiniMax distill planner rejects responses without tool calls", async () => {
  const planner = buildMiniMaxDistillPlanner({
    apiKey: "minimax-key",
    model: "MiniMax-M2.7",
    fetchFn: async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: "我需要更多信息",
            },
          },
        ],
      }),
  });

  await assert.rejects(() => planner.nextToolCall(baseInput("START")), DistillPlannerNoToolCallError);
});

test("MiniMax distill planner exposes invalid tool calls as parse errors", async () => {
  const planner = buildMiniMaxDistillPlanner({
    apiKey: "minimax-key",
    model: "MiniMax-M2.7",
    fetchFn: async () =>
      jsonResponse({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "drop_database",
                    arguments: JSON.stringify({}),
                  },
                },
              ],
            },
          },
        ],
      }),
  });

  await assert.rejects(async () => {
    await planner.nextToolCall(baseInput("START"));
  }, DistillPlannerToolCallParseError);
});
