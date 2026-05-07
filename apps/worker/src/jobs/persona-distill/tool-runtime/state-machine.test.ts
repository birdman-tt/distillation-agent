import assert from "node:assert/strict";
import test from "node:test";

import {
  getNextRuntimeStateForTool,
  isTerminalDistillRuntimeState,
} from "./state-machine.js";

test("distill runtime state machine allows the required happy path", () => {
  assert.equal(getNextRuntimeStateForTool("START", "check_distill_intent_risk"), "RISK_CHECKED");
  assert.equal(getNextRuntimeStateForTool("RISK_CHECKED", "search_sources"), "SOURCES_COLLECTED");
  assert.equal(getNextRuntimeStateForTool("SOURCES_COLLECTED", "clean_sources"), "SOURCES_CLEANED");
  assert.equal(getNextRuntimeStateForTool("SOURCES_CLEANED", "extract_evidence"), "EVIDENCE_EXTRACTED");
  assert.equal(getNextRuntimeStateForTool("EVIDENCE_EXTRACTED", "score_source_coverage"), "COVERAGE_SCORED");
  assert.equal(getNextRuntimeStateForTool("COVERAGE_SCORED", "generate_persona_profile"), "PROFILE_GENERATED");
  assert.equal(getNextRuntimeStateForTool("PROFILE_GENERATED", "validate_persona_profile"), "PROFILE_VALIDATED");
  assert.equal(getNextRuntimeStateForTool("PROFILE_VALIDATED", "persist_persona_candidate"), "PERSISTED");
});

test("distill runtime state machine rejects persistence before validation", () => {
  assert.throws(() => getNextRuntimeStateForTool("START", "persist_persona_candidate"), /not allowed/);
  assert.throws(() => getNextRuntimeStateForTool("COVERAGE_SCORED", "persist_persona_candidate"), /not allowed/);
});

test("distill runtime state machine allows needs sources after profile validation", () => {
  assert.equal(getNextRuntimeStateForTool("COVERAGE_SCORED", "mark_job_needs_sources"), "NEEDS_SOURCES");
  assert.equal(getNextRuntimeStateForTool("PROFILE_VALIDATED", "mark_job_needs_sources"), "NEEDS_SOURCES");
});

test("distill runtime state machine rejects premature needs sources terminal", () => {
  assert.throws(() => getNextRuntimeStateForTool("RISK_CHECKED", "mark_job_needs_sources"), /not allowed/);
  assert.throws(() => getNextRuntimeStateForTool("SOURCES_COLLECTED", "mark_job_needs_sources"), /not allowed/);
});

test("distill runtime terminal states reject every tool", () => {
  assert.equal(isTerminalDistillRuntimeState("PERSISTED"), true);
  assert.equal(isTerminalDistillRuntimeState("NEEDS_SOURCES"), true);
  assert.equal(isTerminalDistillRuntimeState("FAILED"), true);
  assert.throws(() => getNextRuntimeStateForTool("PERSISTED", "mark_job_failed"), /terminal/);
});

test("distill runtime state machine allows failure from non-terminal states", () => {
  assert.equal(getNextRuntimeStateForTool("START", "mark_job_failed"), "FAILED");
  assert.equal(getNextRuntimeStateForTool("PROFILE_GENERATED", "mark_job_failed"), "FAILED");
});
