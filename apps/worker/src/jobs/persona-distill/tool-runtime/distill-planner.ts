import {
  distillToolCallSchema,
  distillToolNameSchema,
  type DistillRuntimeState,
  type DistillToolCall,
  type DistillToolName,
} from "@hall-of-fame/contracts";

export type DistillPlannerJobContext = {
  jobId: string;
  intentId: string;
  discoveryId: string;
  actorUserId: string;
  personaId: string;
  runtimeState: DistillRuntimeState;
  normalizedName: string;
  displayName: string;
  entityType: "REAL_PERSON" | "FICTIONAL_CHARACTER" | "UNKNOWN";
  riskDecision: "ALLOW" | "NEED_REVIEW" | "BLOCK";
  riskReasons: string[];
  selectedSourceCandidateIds: string[];
  selectedExtraSourceIds: string[];
};

export type DistillToolMemorySnapshot = {
  candidateCount: number;
  usableCandidateCount: number;
  approvedSourceCount: number;
  coverageMissingRequirements: string[];
  validationMissingRequirements: string[];
  hasGeneratedProfile: boolean;
  persistedVersionId: string | null;
};

export type DistillPlannerInput = DistillPlannerJobContext & {
  toolResults: Array<{
    seq: number;
    toolName: DistillToolName;
    ok: boolean;
    summary: string;
    data: Record<string, unknown>;
  }>;
  memory: DistillToolMemorySnapshot;
};

export type DistillPlanner = {
  nextToolCall(input: DistillPlannerInput): Promise<DistillToolCall>;
};

type MiniMaxTool = {
  name: DistillToolName;
  description: string;
  parameters: Record<string, unknown>;
};

type MiniMaxToolCall = {
  id?: string;
  type?: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type MiniMaxMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string };

type MiniMaxResponsePayload = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: MiniMaxToolCall[];
    };
  }>;
  error?: {
    message?: string;
  };
};

type FetchLike = typeof fetch;

const defaultBaseUrl = "https://api.minimaxi.com/v1";
const defaultDistillFocus = ["说话方式", "思考方式", "价值判断"];

export class DistillPlannerNotConfiguredError extends Error {
  constructor() {
    super("MiniMax distill planner is not configured");
    this.name = "DistillPlannerNotConfiguredError";
  }
}

export class DistillPlannerNoToolCallError extends Error {
  constructor() {
    super("MiniMax distill planner returned no tool call");
    this.name = "DistillPlannerNoToolCallError";
  }
}

export class DistillPlannerToolCallParseError extends Error {
  rawToolName: string | null;
  rawArguments: unknown;

  constructor(input: { message: string; rawToolName: string | null; rawArguments: unknown }) {
    super(input.message);
    this.name = "DistillPlannerToolCallParseError";
    this.rawToolName = input.rawToolName;
    this.rawArguments = input.rawArguments;
  }
}

const parseCall = (candidate: unknown): DistillToolCall => distillToolCallSchema.parse(candidate);

const buildNeedsSourcesCall = (requirements: string[]) =>
  parseCall({
    toolName: "mark_job_needs_sources",
    input: {
      missingRequirements: requirements.length > 0 ? requirements : ["资料还不够"],
      userMessage: "资料还不够，需要再补充一些可用资料。",
    },
  });

export const buildDeterministicDistillPlanner = (): DistillPlanner => ({
  async nextToolCall(input) {
    switch (input.runtimeState) {
      case "START":
        return parseCall({
          toolName: "check_distill_intent_risk",
          input: {
            intentId: input.intentId,
            normalizedName: input.normalizedName,
            entityType: input.entityType,
            riskDecision: input.riskDecision,
            riskReasons: input.riskReasons,
          },
        });
      case "RISK_CHECKED":
        return parseCall({
          toolName: "search_sources",
          input: {
            discoveryId: input.discoveryId,
            selectedSourceCandidateIds: input.selectedSourceCandidateIds,
            selectedExtraSourceIds: input.selectedExtraSourceIds,
          },
        });
      case "SOURCES_COLLECTED":
        return parseCall({
          toolName: "clean_sources",
          input: {
            maxCharsPerSource: 1200,
            dropLowTrustSources: false,
          },
        });
      case "SOURCES_CLEANED":
        return parseCall({
          toolName: "extract_evidence",
          input: {
            buckets: [],
            maxEvidencePerBucket: 4,
          },
        });
      case "EVIDENCE_EXTRACTED":
        return parseCall({
          toolName: "score_source_coverage",
          input: {
            minimumSources: input.entityType === "FICTIONAL_CHARACTER" ? 2 : 3,
            minimumBuckets: 2,
          },
        });
      case "COVERAGE_SCORED":
        if (input.memory.coverageMissingRequirements.length > 0) {
          return buildNeedsSourcesCall(input.memory.coverageMissingRequirements);
        }
        return parseCall({
          toolName: "generate_persona_profile",
          input: {
            displayName: input.displayName,
            distillFocus: defaultDistillFocus,
          },
        });
      case "PROFILE_GENERATED":
        return parseCall({
          toolName: "validate_persona_profile",
          input: {
            strictness: "preview",
          },
        });
      case "PROFILE_VALIDATED":
        if (input.memory.validationMissingRequirements.length > 0) {
          return buildNeedsSourcesCall(input.memory.validationMissingRequirements);
        }
        return parseCall({
          toolName: "persist_persona_candidate",
          input: {
            idempotencyKey: `${input.jobId}:candidate`,
          },
        });
      case "PERSISTED":
      case "NEEDS_SOURCES":
      case "FAILED":
        throw new Error(`Runtime state ${input.runtimeState} is terminal`);
    }
  },
});

const toolParameters: Record<DistillToolName, Record<string, unknown>> = {
  check_distill_intent_risk: {
    type: "object",
    required: ["intentId", "normalizedName", "entityType", "riskDecision"],
    properties: {
      intentId: { type: "string" },
      normalizedName: { type: "string" },
      entityType: { type: "string", enum: ["REAL_PERSON", "FICTIONAL_CHARACTER", "UNKNOWN"] },
      riskDecision: { type: "string", enum: ["ALLOW", "NEED_REVIEW", "BLOCK"] },
      riskReasons: { type: "array", items: { type: "string" } },
    },
  },
  search_sources: {
    type: "object",
    required: ["discoveryId"],
    properties: {
      discoveryId: { type: "string" },
      selectedSourceCandidateIds: { type: "array", items: { type: "string" } },
      selectedExtraSourceIds: { type: "array", items: { type: "string" } },
    },
  },
  clean_sources: {
    type: "object",
    properties: {
      maxCharsPerSource: { type: "integer", minimum: 200, maximum: 5000 },
      dropLowTrustSources: { type: "boolean" },
    },
  },
  extract_evidence: {
    type: "object",
    properties: {
      buckets: { type: "array", items: { type: "string" } },
      maxEvidencePerBucket: { type: "integer", minimum: 1, maximum: 12 },
    },
  },
  score_source_coverage: {
    type: "object",
    properties: {
      minimumSources: { type: "integer", minimum: 1, maximum: 10 },
      minimumBuckets: { type: "integer", minimum: 1, maximum: 6 },
    },
  },
  generate_persona_profile: {
    type: "object",
    required: ["displayName", "distillFocus"],
    properties: {
      displayName: { type: "string" },
      distillFocus: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
    },
  },
  validate_persona_profile: {
    type: "object",
    properties: {
      strictness: { type: "string", enum: ["preview", "publish"] },
    },
  },
  persist_persona_candidate: {
    type: "object",
    required: ["idempotencyKey"],
    properties: {
      idempotencyKey: { type: "string" },
    },
  },
  mark_job_needs_sources: {
    type: "object",
    required: ["missingRequirements", "userMessage"],
    properties: {
      missingRequirements: { type: "array", minItems: 1, items: { type: "string" } },
      userMessage: { type: "string", maxLength: 160 },
    },
  },
  mark_job_failed: {
    type: "object",
    required: ["code", "message"],
    properties: {
      code: { type: "string" },
      message: { type: "string", maxLength: 500 },
      retryable: { type: "boolean" },
    },
  },
};

export const buildDistillPlannerTools = (): MiniMaxTool[] =>
  distillToolNameSchema.options.map((name) => ({
    name,
    description: `Call distill runtime tool ${name}.`,
    parameters: toolParameters[name],
  }));

const stringifyPlannerInput = (input: DistillPlannerInput) =>
  JSON.stringify({
    jobId: input.jobId,
    runtimeState: input.runtimeState,
    normalizedName: input.normalizedName,
    entityType: input.entityType,
    riskDecision: input.riskDecision,
    riskReasons: input.riskReasons,
    selectedSourceCandidateIds: input.selectedSourceCandidateIds,
    selectedExtraSourceIds: input.selectedExtraSourceIds,
    memory: input.memory,
    recentToolResults: input.toolResults.slice(-4),
  });

const parseToolArguments = (value: string) => {
  if (!value.trim()) {
    return {};
  }
  return JSON.parse(value) as unknown;
};

const parseMiniMaxToolCall = (toolCall: MiniMaxToolCall): DistillToolCall => {
  const rawToolName = toolCall.function.name;
  let rawArguments: unknown;
  try {
    rawArguments = parseToolArguments(toolCall.function.arguments);
  } catch (error) {
    throw new DistillPlannerToolCallParseError({
      message: error instanceof Error ? error.message : "Tool call arguments are not valid JSON",
      rawToolName,
      rawArguments: toolCall.function.arguments,
    });
  }

  const parsed = distillToolCallSchema.safeParse({
    toolName: rawToolName,
    input: rawArguments,
  });
  if (!parsed.success) {
    throw new DistillPlannerToolCallParseError({
      message: parsed.error.message,
      rawToolName,
      rawArguments,
    });
  }

  return parsed.data;
};

export const buildMiniMaxDistillPlanner = (input: {
  apiKey?: string | null;
  baseUrl?: string;
  model: string;
  fetchFn?: FetchLike;
}): DistillPlanner => ({
  async nextToolCall(plannerInput) {
    if (!input.apiKey?.trim()) {
      throw new DistillPlannerNotConfiguredError();
    }

    const fetchFn = input.fetchFn ?? fetch;
    const response = await fetchFn(`${(input.baseUrl ?? defaultBaseUrl).replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        reasoning_split: true,
        tool_choice: "auto",
        messages: [
          {
            role: "system",
            content:
              "你是一键蒸馏流程 planner。你只能选择一个提供的 function tool。不要输出普通文本，不要解释。",
          },
          {
            role: "user",
            content: stringifyPlannerInput(plannerInput),
          },
        ] satisfies MiniMaxMessage[],
        tools: buildDistillPlannerTools().map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
      }),
    });
    const payload = (await response.json()) as MiniMaxResponsePayload;
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `MiniMax distill planner failed with ${response.status}`);
    }

    const toolCall = payload.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new DistillPlannerNoToolCallError();
    }

    return parseMiniMaxToolCall(toolCall);
  },
});

export const buildDistillPlannerFromEnv = () => {
  if (process.env.PERSONA_DISTILL_PLANNER_PROVIDER === "minimax") {
    return buildMiniMaxDistillPlanner({
      apiKey: process.env.MINIMAX_API_KEY,
      baseUrl: process.env.MINIMAX_BASE_URL,
      model: process.env.MINIMAX_PLANNER_MODEL ?? "MiniMax-M2.7",
    });
  }
  return buildDeterministicDistillPlanner();
};
