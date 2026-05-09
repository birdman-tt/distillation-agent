export type PlannerToolName =
  | "chat_memory"
  | "persona_knowledge"
  | "web_search"
  | "proactive_candidate";

export type ProactiveTraceOutcome =
  | "not_requested"
  | "created"
  | "skipped_disabled"
  | "skipped_not_explicit"
  | "failed";

export const buildRequestedPlannerTools = (input: {
  needChatMemory: boolean;
  needPersonaKnowledge: boolean;
  needWebSearch: boolean;
  proactiveCandidate: { shouldSchedule: boolean };
}): PlannerToolName[] => {
  const tools: PlannerToolName[] = [];
  if (input.needChatMemory) tools.push("chat_memory");
  if (input.needPersonaKnowledge) tools.push("persona_knowledge");
  if (input.needWebSearch) tools.push("web_search");
  if (input.proactiveCandidate.shouldSchedule) tools.push("proactive_candidate");
  return tools;
};

export const buildToolExecutionTrace = (input: {
  requestedTools: PlannerToolName[];
  chatMemoryRequested: boolean;
  chatMemoryReturnedCount: number;
  personaKnowledgeRequested: boolean;
  personaKnowledgeReturnedCount: number;
  webSearchRequested: boolean;
  webSearchAttempted: boolean;
  webSearchResultUsed: boolean;
  webSearchFreshnessStatus: string | null;
  webSearchSourceCount: number;
  proactiveRequested: boolean;
  proactiveOutcome: ProactiveTraceOutcome;
}) => {
  const attemptedTools: PlannerToolName[] = [];
  const resultUsedTools: PlannerToolName[] = [];

  if (input.chatMemoryRequested) attemptedTools.push("chat_memory");
  if (input.personaKnowledgeRequested) attemptedTools.push("persona_knowledge");
  if (input.webSearchAttempted) attemptedTools.push("web_search");
  if (input.proactiveRequested) attemptedTools.push("proactive_candidate");

  if (input.chatMemoryReturnedCount > 0) resultUsedTools.push("chat_memory");
  if (input.personaKnowledgeReturnedCount > 0) resultUsedTools.push("persona_knowledge");
  if (input.webSearchResultUsed) resultUsedTools.push("web_search");
  if (input.proactiveOutcome === "created") resultUsedTools.push("proactive_candidate");

  return {
    requestedTools: input.requestedTools,
    attemptedTools,
    resultUsedTools,
    chatMemoryRequested: input.chatMemoryRequested,
    chatMemoryReturnedCount: input.chatMemoryReturnedCount,
    personaKnowledgeRequested: input.personaKnowledgeRequested,
    personaKnowledgeReturnedCount: input.personaKnowledgeReturnedCount,
    webSearchRequested: input.webSearchRequested,
    webSearchAttempted: input.webSearchAttempted,
    webSearchResultUsed: input.webSearchResultUsed,
    webSearchFreshnessStatus: input.webSearchFreshnessStatus,
    webSearchSourceCount: input.webSearchSourceCount,
    proactiveRequested: input.proactiveRequested,
    proactiveOutcome: input.proactiveOutcome,
  };
};
