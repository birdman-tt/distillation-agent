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
  inferenceLevel: z.enum(["grounded", "inferred", "insufficient_evidence"]),
  conflictDetected: z.boolean(),
  refusalReason: z.string().optional().nullable(),
});
type ChatModelReply = z.infer<typeof chatModelReplySchema>;
type ChatStructuredRequester = (input: Parameters<typeof requestStructuredJson>[0]) => Promise<ChatModelReply>;

const normalizeRefusalReason = (
  value: string | null | undefined,
  requiredInferenceLevel: "grounded" | "inferred" | "insufficient_evidence",
) => {
  const normalized = value?.trim() ?? "";
  const parsed = refusalReasonSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  return requiredInferenceLevel === "insufficient_evidence" ? "out_of_scope" : "none";
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
      ? "insufficient_evidence"
      : classification.category === "SUPPORTED_TOPIC"
        ? "grounded"
        : classification.category === "STYLE_INFERENCE"
          ? "inferred"
          : "insufficient_evidence";

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

  if (classification.category === "OUT_OF_SCOPE") {
    return chatGenerationSchema.parse({
      answer: "这个问题超出了当前对象资料的覆盖范围，我不能稳定地给出可靠回答。",
      basis,
      basisSummary: {
        mode: "UNSUPPORTED",
        summary: "当前问题没有命中已知主题，也不适合做自由扩展。",
      },
      inferenceLevel: "insufficient_evidence",
      conflictDetected: false,
      refusalReason: "out_of_scope",
    });
  }

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

    const clampedInferenceLevel =
      requiredInferenceLevel === "grounded"
        ? "grounded"
        : requiredInferenceLevel === "insufficient_evidence"
          ? "insufficient_evidence"
          : modelResult.inferenceLevel === "grounded"
            ? "inferred"
            : modelResult.inferenceLevel;

    return chatGenerationSchema.parse({
      ...modelResult,
      basis,
      basisSummary:
        requiredInferenceLevel === "inferred"
          ? {
              mode: "INFERRED",
              summary: modelResult.basisSummary.summary,
            }
          : modelResult.basisSummary,
      inferenceLevel: clampedInferenceLevel,
      refusalReason:
        requiredInferenceLevel === "insufficient_evidence"
          ? "out_of_scope"
          : normalizeRefusalReason(modelResult.refusalReason, requiredInferenceLevel),
    });
  } catch (error) {
    if (!(error instanceof DeepSeekNotConfiguredError)) {
      console.warn("[chat-workflow] falling back to deterministic reply", error);
    }
  }

  if (input.seed) {
    return chatGenerationSchema.parse(createSeedReply(input.seed, input.content));
  }

  const reply = createDynamicReply(runtimeContext.personaVersionId, input.content, classification);
  return reply ? chatGenerationSchema.parse(reply) : null;
};
