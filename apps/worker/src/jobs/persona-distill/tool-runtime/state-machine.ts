import type { DistillRuntimeState, DistillToolName } from "@hall-of-fame/contracts";

const terminalStates = new Set<DistillRuntimeState>(["PERSISTED", "NEEDS_SOURCES", "FAILED"]);

const requiredTransitions: Partial<Record<DistillRuntimeState, Partial<Record<DistillToolName, DistillRuntimeState>>>> = {
  START: {
    check_distill_intent_risk: "RISK_CHECKED",
  },
  RISK_CHECKED: {
    search_sources: "SOURCES_COLLECTED",
  },
  SOURCES_COLLECTED: {
    clean_sources: "SOURCES_CLEANED",
  },
  SOURCES_CLEANED: {
    extract_evidence: "EVIDENCE_EXTRACTED",
  },
  EVIDENCE_EXTRACTED: {
    score_source_coverage: "COVERAGE_SCORED",
  },
  COVERAGE_SCORED: {
    generate_persona_profile: "PROFILE_GENERATED",
    mark_job_needs_sources: "NEEDS_SOURCES",
  },
  PROFILE_GENERATED: {
    validate_persona_profile: "PROFILE_VALIDATED",
  },
  PROFILE_VALIDATED: {
    persist_persona_candidate: "PERSISTED",
    mark_job_needs_sources: "NEEDS_SOURCES",
  },
};

export class DistillToolStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DistillToolStateError";
  }
}

export const isTerminalDistillRuntimeState = (state: DistillRuntimeState) => terminalStates.has(state);

export const getNextRuntimeStateForTool = (
  state: DistillRuntimeState,
  toolName: DistillToolName,
): DistillRuntimeState => {
  if (isTerminalDistillRuntimeState(state)) {
    throw new DistillToolStateError(`Runtime state ${state} is terminal; tool ${toolName} is not allowed`);
  }

  if (toolName === "mark_job_failed") {
    return "FAILED";
  }

  const nextState = requiredTransitions[state]?.[toolName];
  if (!nextState) {
    throw new DistillToolStateError(`Tool ${toolName} is not allowed from runtime state ${state}`);
  }

  return nextState;
};
