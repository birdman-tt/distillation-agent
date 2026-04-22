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
  inferenceLevel: z.string(),
  conflictDetected: z.boolean(),
  refusalReason: z.string().optional().nullable(),
});
type ChatModelReply = z.infer<typeof chatModelReplySchema>;
type ChatStructuredRequester = (input: Parameters<typeof requestStructuredJson>[0]) => Promise<ChatModelReply>;

const normalizeRefusalReason = (value: string | null | undefined) => {
  const normalized = value?.trim() ?? "";
  const parsed = refusalReasonSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  return "none";
};

const normalizeInferenceLevel = (input: {
  rawLevel: string;
  classificationCategory: RuntimeClassification["category"];
  basisMode: ChatModelReply["basisSummary"]["mode"];
}) => {
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
}, deps: {
  requestStructuredJson?: ChatStructuredRequester;
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

  const systemPrompt = buildChatSystemPrompt({
    displayName: runtimeContext.displayName,
    previewIntro: runtimeContext.previewIntro,
    profileSummary: runtimeContext.profileSummary,
    styleExamples: runtimeContext.styleExamples,
    requiredInferenceLevel,
  });
  const userPrompt = buildChatUserPrompt({
    question: input.content,
    classification,
    evidence: runtimeContext.evidence,
  });

  const basis = runtimeContext.evidence.map((item) => ({
    sourceId: item.sourceId,
    snippet: item.snippet,
  }));

  try {
    const modelResult = await (deps.requestStructuredJson ?? requestStructuredJson)({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat",
      systemPrompt,
      userPrompt,
      schema: chatModelReplySchema,
      maxTokens: 700,
    });
    console.info("[chat-workflow] used structured model response", {
      model: process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat",
      personaVersionId: runtimeContext.personaVersionId,
    });

    const normalizedInferenceLevel = normalizeInferenceLevel({
      rawLevel: modelResult.inferenceLevel,
      classificationCategory: classification.category,
      basisMode: modelResult.basisSummary.mode,
    });

    return chatGenerationSchema.parse({
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
  } catch (error) {
    if (!(error instanceof DeepSeekNotConfiguredError)) {
      console.warn("[chat-workflow] falling back to deterministic reply", error);
    }
  }

  const reply = await createDynamicReply(runtimeContext.personaVersionId, input.content, classification);
  if (reply) {
    return chatGenerationSchema.parse(reply);
  }

  if (input.seed) {
    return chatGenerationSchema.parse(createSeedReply(input.seed, input.content));
  }

  return null;
};
