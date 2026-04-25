import { chatContextEnvelopeSchema } from "@hall-of-fame/contracts";
import { DeepSeekNotConfiguredError, requestStructuredJson } from "@hall-of-fame/deepseek-client";
import { refusalReasonSchema } from "@hall-of-fame/domain";
import {
  buildChatSystemPrompt,
  buildChatUserPrompt,
  chatGenerationSchema,
} from "@hall-of-fame/prompt-kit";
import { z } from "zod";

import { createSeedReply } from "../../seed/official-personae.js";
import { createDynamicReply } from "../../store/persona-store.js";
import { classifyUserQuestion } from "./classification.js";
import type { ChatTurnRouting } from "./turn-router.js";

type PromptEvidenceItem = {
  sourceId: string;
  title: string | null;
  snippet: string;
};

type OfficialSeed = Parameters<typeof createSeedReply>[0];
type RuntimeContext = {
  personaVersionId: string;
  displayName: string;
  previewIntro: string | null;
  profileSummary?: string | null;
  styleExamples?: string[];
  focusKeywords: string[];
  evidence: PromptEvidenceItem[];
};

const chatModelReplySchema = z.object({
  answer: z.string(),
  basisSummary: z.object({
    mode: z.enum(["SUPPORTED", "INFERRED", "UNSUPPORTED"]),
    summary: z.string(),
  }),
  inferenceLevel: z.union([z.string(), z.number()]),
  conflictDetected: z.boolean(),
  refusalReason: z.string().optional().nullable(),
});
type ChatModelReply = z.infer<typeof chatModelReplySchema>;
type ChatStructuredRequester = (input: Parameters<typeof requestStructuredJson>[0]) => Promise<ChatModelReply>;
type ChatContextEnvelope = z.infer<typeof chatContextEnvelopeSchema>;
type ChatTurnPlanForPrompt = {
  userIntent: string;
  contextUsed: string[];
  replyGoal: string;
  responseOutline: string[];
  shouldSendMultipleMessages: boolean;
  suggestedMessageCount: number;
  avoidRepeating: string[];
};
type ChatWorkflowTraceArtifact =
  | {
      artifactKey: string;
      contentType?: string;
      kind: "text";
      value: string;
    }
  | {
      artifactKey: string;
      contentType?: string;
      kind: "json";
      value: unknown;
    };
type ChatWorkflowTraceEvent = {
  eventName: string;
  stage: string;
  status: string;
  level?: "info" | "warn" | "error";
  durationMs?: number;
  fields?: Record<string, unknown>;
  artifacts?: ChatWorkflowTraceArtifact[];
};
type ChatWorkflowTraceSink = (event: ChatWorkflowTraceEvent) => void;

const normalizeComparableText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "")
    .trim();

const commonPrefixLength = (left: string, right: string) => {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return index;
};

const isTooCloseToRecentAssistantAnswer = (answer: string, previousAnswers: string[]) => {
  const normalizedAnswer = normalizeComparableText(answer);
  if (normalizedAnswer.length < 8) {
    return false;
  }

  return previousAnswers.some((item) => {
    const normalizedPrevious = normalizeComparableText(item);
    if (normalizedPrevious.length < 8) {
      return false;
    }

    if (normalizedAnswer === normalizedPrevious) {
      return true;
    }

    const shorterLength = Math.min(normalizedAnswer.length, normalizedPrevious.length);
    if (shorterLength >= 12) {
      const shorter = normalizedAnswer.length <= normalizedPrevious.length ? normalizedAnswer : normalizedPrevious;
      const longer = shorter === normalizedAnswer ? normalizedPrevious : normalizedAnswer;
      if (longer.includes(shorter)) {
        return true;
      }
    }

    const prefixRatio = commonPrefixLength(normalizedAnswer, normalizedPrevious) / shorterLength;
    return shorterLength >= 10 && prefixRatio >= 0.72;
  });
};

const collectRecentAssistantAnswers = (chatContext?: ChatContextEnvelope) => {
  if (!chatContext) {
    return [];
  }

  const seen = new Set<string>();
  return [...chatContext.recentTurns, ...chatContext.retrievedMemories]
    .filter((item) => item.role === "ASSISTANT")
    .map((item) => item.content.trim())
    .filter((item) => item.length > 0)
    .filter((item) => {
      if (seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
};

const normalizeRefusalReason = (value: string | null | undefined) => {
  const normalized = value?.trim() ?? "";
  const parsed = refusalReasonSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  return "none";
};

const previewText = (value: string | null | undefined, limit = 280) => {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}...`;
};

const normalizeInferenceLevel = (input: {
  rawLevel: string | number;
  classificationCategory: RuntimeClassification["category"];
  basisMode: ChatModelReply["basisSummary"]["mode"];
}) => {
  if (typeof input.rawLevel === "number") {
    if (input.basisMode === "SUPPORTED" && input.classificationCategory === "THEME_ANCHORED") {
      return "grounded";
    }
    if (input.basisMode === "UNSUPPORTED") {
      return "insufficient_evidence";
    }
    return "inferred";
  }

  const normalized = input.rawLevel.trim().toLowerCase();
  if (normalized === "grounded" || normalized === "inferred" || normalized === "insufficient_evidence") {
    if (input.classificationCategory === "THEME_ANCHORED") {
      return normalized;
    }
    return normalized === "grounded" ? "inferred" : normalized;
  }

  if (input.basisMode === "SUPPORTED" && input.classificationCategory === "THEME_ANCHORED") {
    return "grounded";
  }

  return "inferred";
};

type RuntimeClassification = ReturnType<typeof classifyUserQuestion>;

const defaultReplyModeForClassification = (classification: RuntimeClassification): ChatTurnRouting["replyMode"] => {
  switch (classification.category) {
    case "HIGH_RISK":
      return "HIGH_RISK";
    case "FACT_SPECIFIC":
      return "FACT";
    case "THEME_ANCHORED":
      return "DOMAIN";
    case "OPEN_ENDED":
      return "CASUAL";
  }
};

const defaultPersonaIntensityForMode = (replyMode: ChatTurnRouting["replyMode"]): ChatTurnRouting["personaIntensity"] => {
  switch (replyMode) {
    case "DOMAIN":
      return "high";
    case "FACT":
    case "HIGH_RISK":
      return "medium";
    case "CASUAL":
      return "low";
  }
};

const readChatTemperature = () => {
  const value = Number(process.env.DEEPSEEK_CHAT_TEMPERATURE ?? "0.8");
  if (!Number.isFinite(value)) {
    return 0.8;
  }

  return Math.min(2, Math.max(0, value));
};

const buildOfficialSeedContext = (seed: OfficialSeed): RuntimeContext => {
  const supportedEvidence = seed.supportedReply.basis.map((item) => ({
    sourceId: item.sourceId,
    title: "官方资料",
    snippet: item.snippet,
  }));
  const inferredEvidence = seed.inferredReply.basis.map((item) => ({
    sourceId: item.sourceId,
    title: "风格推演依据",
    snippet: item.snippet,
  }));
  const seenEvidence = new Set<string>();
  const evidence = [...supportedEvidence, ...inferredEvidence].filter((item) => {
    const key = `${item.sourceId}:${item.snippet}`;
    if (seenEvidence.has(key)) {
      return false;
    }
    seenEvidence.add(key);
    return true;
  });

  return {
    personaVersionId: seed.version.id,
    displayName: seed.persona.displayName,
    previewIntro: seed.version.previewIntro,
    profileSummary:
      typeof seed.version.profileJson.summary === "string" ? seed.version.profileJson.summary : seed.version.previewIntro,
    styleExamples: seed.version.sampleAnswers,
    focusKeywords: [
      ...seed.replyKeywords,
      ...((seed.version.profileJson.topicStrengths as string[] | undefined) ?? []),
      ...seed.version.recommendedQuestions,
      ...seed.version.sampleAnswers,
    ],
    evidence,
  };
};

export const runChatWorkflow = async (input: {
  content: string;
  seed?: OfficialSeed | null;
  dynamicContext?: RuntimeContext;
  chatContext?: ChatContextEnvelope;
  turnPlan?: ChatTurnPlanForPrompt | null;
  turnRouting?: Pick<ChatTurnRouting, "replyMode" | "personaIntensity"> | null;
}, deps: {
  requestStructuredJson?: ChatStructuredRequester;
  trace?: ChatWorkflowTraceSink;
} = {}) => {
  const runtimeContext = input.dynamicContext ?? (input.seed ? buildOfficialSeedContext(input.seed) : undefined);

  if (!runtimeContext) {
    return null;
  }

  const classification = classifyUserQuestion(input.content, runtimeContext.focusKeywords);
  const requiredInferenceLevel =
    classification.category === "HIGH_RISK"
      ? "inferred"
      : classification.category === "THEME_ANCHORED"
        ? "grounded"
        : "inferred";
  deps.trace?.({
    eventName: "chat.classification.completed",
    stage: "classification",
    status: "completed",
    fields: {
      category: classification.category,
      matchedKeyword: classification.matchedKeyword ?? null,
      requiredInferenceLevel,
    },
    artifacts: [
      {
        artifactKey: "classification_snapshot",
        kind: "json",
        value: classification,
      },
    ],
  });

  const replyMode = input.turnRouting?.replyMode ?? defaultReplyModeForClassification(classification);
  const personaIntensity = input.turnRouting?.personaIntensity ?? defaultPersonaIntensityForMode(replyMode);
  const systemPrompt = buildChatSystemPrompt({
    displayName: runtimeContext.displayName,
    previewIntro: runtimeContext.previewIntro,
    profileSummary: runtimeContext.profileSummary,
    styleExamples: runtimeContext.styleExamples,
    requiredInferenceLevel,
    replyMode,
    personaIntensity,
  });
  const userPrompt = buildChatUserPrompt({
    question: input.content,
    classification,
    recentTurns: input.chatContext?.recentTurns ?? [],
    retrievedMemories: input.chatContext?.retrievedMemories ?? [],
    turnPlan: input.turnPlan ?? null,
    evidence: runtimeContext.evidence,
  });
  deps.trace?.({
    eventName: "chat.prompt.built",
    stage: "prompt",
    status: "completed",
    fields: {
      systemPromptPreview: previewText(systemPrompt),
      userPromptPreview: previewText(userPrompt),
      evidenceCount: runtimeContext.evidence.length,
      recentTurnCount: input.chatContext?.recentTurns.length ?? 0,
      retrievedMemoryCount: input.chatContext?.retrievedMemories.length ?? 0,
      plannerUsed: Boolean(input.turnPlan),
      replyMode,
      personaIntensity,
    },
    artifacts: [
      {
        artifactKey: "system_prompt",
        kind: "text",
        value: systemPrompt,
      },
      {
        artifactKey: "user_prompt",
        kind: "text",
        value: userPrompt,
      },
    ],
  });

  const basis = runtimeContext.evidence.map((item) => ({
    sourceId: item.sourceId,
    snippet: item.snippet,
  }));

  const recentAssistantAnswers = collectRecentAssistantAnswers(input.chatContext);

  const model = process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat";
  const temperature = readChatTemperature();
  const maxTokens = 700;
  const requestModelReply = async (attempt: number, extraInstruction?: string) => {
    const finalSystemPrompt = extraInstruction ? `${systemPrompt}\n${extraInstruction}` : systemPrompt;
    const startedAt = Date.now();
    deps.trace?.({
      eventName: "chat.model.request.started",
      stage: "model",
      status: "started",
      fields: {
        attempt,
        provider: "deepseek",
        model,
        temperature,
        maxTokens,
      },
    });

    let telemetryResponse:
      | {
          status: number;
          ok: boolean;
          payload: unknown;
          rawContent: string | null;
        }
      | undefined;

    try {
      const modelReply = await (deps.requestStructuredJson ?? requestStructuredJson)({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseUrl: process.env.DEEPSEEK_BASE_URL,
        model,
        temperature,
        systemPrompt: finalSystemPrompt,
        userPrompt,
        schema: chatModelReplySchema,
        maxTokens,
        telemetry: {
          onResponse: (payload) => {
            telemetryResponse = payload;
          },
        },
      });

      deps.trace?.({
        eventName: "chat.model.request.completed",
        stage: "model",
        status: "completed",
        durationMs: Date.now() - startedAt,
        fields: {
          attempt,
          provider: "deepseek",
          model,
          temperature,
          maxTokens,
          httpStatus: telemetryResponse?.status ?? null,
          parsedOk: true,
          rawResponsePreview: previewText(telemetryResponse?.rawContent),
        },
        artifacts: telemetryResponse
          ? [
              {
                artifactKey: attempt === 1 ? "raw_model_response" : `raw_model_response_attempt_${attempt}`,
                kind: "json",
                value: telemetryResponse.payload,
              },
            ]
          : [],
      });

      return modelReply;
    } catch (error) {
      deps.trace?.({
        eventName: "chat.model.request.failed",
        stage: "model",
        status: "failed",
        level: error instanceof DeepSeekNotConfiguredError ? "warn" : "error",
        durationMs: Date.now() - startedAt,
        fields: {
          attempt,
          provider: "deepseek",
          model,
          temperature,
          maxTokens,
          httpStatus: telemetryResponse?.status ?? null,
          errorMessage: error instanceof Error ? error.message : "unknown error",
        },
        artifacts: telemetryResponse
          ? [
              {
                artifactKey: attempt === 1 ? "raw_model_response" : `raw_model_response_attempt_${attempt}`,
                kind: "json",
                value: telemetryResponse.payload,
              },
            ]
          : [],
      });
      throw error;
    }
  };

  try {
    let modelResult = await requestModelReply(1);

    if (isTooCloseToRecentAssistantAnswer(modelResult.answer, recentAssistantAnswers)) {
      modelResult = await requestModelReply(
        2,
        "上一轮草稿与近期 assistant 话术过近。必须换一个新的开头与表达路径，不要重复对象摘要、示例回答或最近 assistant 原句。",
      );
    }

    console.info("[chat-workflow] used structured model response", {
      model: process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat",
      personaVersionId: runtimeContext.personaVersionId,
    });

    const normalizedInferenceLevel = normalizeInferenceLevel({
      rawLevel: modelResult.inferenceLevel,
      classificationCategory: classification.category,
      basisMode: modelResult.basisSummary.mode,
    });

    const normalizedReply = chatGenerationSchema.parse({
      ...modelResult,
      basis,
      basisSummary:
        classification.category === "THEME_ANCHORED" && modelResult.basisSummary.mode === "SUPPORTED"
          ? modelResult.basisSummary
          : modelResult.basisSummary.mode === "SUPPORTED"
            ? {
                mode: "INFERRED",
                summary: modelResult.basisSummary.summary,
              }
            : modelResult.basisSummary,
      inferenceLevel: normalizedInferenceLevel,
      refusalReason: normalizeRefusalReason(modelResult.refusalReason),
    });
    deps.trace?.({
      eventName: "chat.model.response.normalized",
      stage: "normalization",
      status: "completed",
      fields: {
        basisMode: normalizedReply.basisSummary.mode,
        inferenceLevel: normalizedReply.inferenceLevel,
        conflictDetected: normalizedReply.conflictDetected,
        refusalReason: normalizedReply.refusalReason,
      },
      artifacts: [
        {
          artifactKey: "normalized_model_response",
          kind: "json",
          value: normalizedReply,
        },
      ],
    });

    return normalizedReply;
  } catch (error) {
    if (!(error instanceof DeepSeekNotConfiguredError)) {
      console.warn("[chat-workflow] falling back to deterministic reply", error);
    }
    deps.trace?.({
      eventName: "chat.workflow.fallback.used",
      stage: "fallback",
      status: "completed",
      level: error instanceof DeepSeekNotConfiguredError ? "warn" : "error",
      fields: {
        fallbackReason: error instanceof DeepSeekNotConfiguredError ? "deepseek_not_configured" : "model_error",
        errorMessage: error instanceof Error ? error.message : "unknown error",
      },
    });
  }

  const reply = await createDynamicReply(runtimeContext.personaVersionId, input.content, classification);
  if (reply) {
    const normalizedReply = chatGenerationSchema.parse(reply);
    deps.trace?.({
      eventName: "chat.model.response.normalized",
      stage: "normalization",
      status: "completed",
      fields: {
        basisMode: normalizedReply.basisSummary.mode,
        inferenceLevel: normalizedReply.inferenceLevel,
        conflictDetected: normalizedReply.conflictDetected,
        refusalReason: normalizedReply.refusalReason,
        responseSource: "dynamic_fallback",
      },
      artifacts: [
        {
          artifactKey: "normalized_model_response",
          kind: "json",
          value: normalizedReply,
        },
      ],
    });
    return normalizedReply;
  }

  if (input.seed) {
    const normalizedReply = chatGenerationSchema.parse(createSeedReply(input.seed, input.content));
    deps.trace?.({
      eventName: "chat.model.response.normalized",
      stage: "normalization",
      status: "completed",
      fields: {
        basisMode: normalizedReply.basisSummary.mode,
        inferenceLevel: normalizedReply.inferenceLevel,
        conflictDetected: normalizedReply.conflictDetected,
        refusalReason: normalizedReply.refusalReason,
        responseSource: "seed_fallback",
      },
      artifacts: [
        {
          artifactKey: "normalized_model_response",
          kind: "json",
          value: normalizedReply,
        },
      ],
    });
    return normalizedReply;
  }

  return null;
};

export const __internal = {
  isTooCloseToRecentAssistantAnswer,
};
