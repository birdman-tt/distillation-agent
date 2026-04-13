import { DeepSeekNotConfiguredError, requestStructuredJson } from "@hall-of-fame/deepseek-client";
import {
  buildChatSystemPrompt,
  buildChatUserPrompt,
  chatGenerationSchema,
} from "@hall-of-fame/prompt-kit";

import { createSeedReply } from "../../seed/official-personae.js";
import { createDynamicReply } from "../../store/persona-store.js";
import { classifyUserQuestion } from "./classification.js";

type PromptEvidenceItem = {
  sourceId: string;
  title: string | null;
  snippet: string;
};

type OfficialSeed = Parameters<typeof createSeedReply>[0];

export const runChatWorkflow = async (input: {
  content: string;
  seed?: OfficialSeed | null;
  dynamicContext?: {
    personaVersionId: string;
    displayName: string;
    previewIntro: string | null;
    focusKeywords: string[];
    evidence: PromptEvidenceItem[];
  };
}) => {
  if (input.seed) {
    return chatGenerationSchema.parse(createSeedReply(input.seed, input.content));
  }

  if (!input.dynamicContext) {
    return null;
  }

  const classification = classifyUserQuestion(input.content, input.dynamicContext.focusKeywords);
  const requiredInferenceLevel =
    classification.category === "HIGH_RISK"
      ? "insufficient_evidence"
      : classification.category === "SUPPORTED_TOPIC"
        ? "grounded"
        : classification.category === "STYLE_INFERENCE"
          ? "inferred"
          : "insufficient_evidence";

  const systemPrompt = buildChatSystemPrompt({
    displayName: input.dynamicContext.displayName,
    previewIntro: input.dynamicContext.previewIntro,
    requiredInferenceLevel,
  });
  const userPrompt = buildChatUserPrompt({
    question: input.content,
    classification,
    evidence: input.dynamicContext.evidence,
  });

  const basis = input.dynamicContext.evidence.map((item) => ({
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
    const modelResult = await requestStructuredJson({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat",
      systemPrompt,
      userPrompt,
      schema: chatGenerationSchema.omit({ basis: true }),
      maxTokens: 700,
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
      refusalReason: requiredInferenceLevel === "insufficient_evidence" ? "out_of_scope" : modelResult.refusalReason,
    });
  } catch (error) {
    if (!(error instanceof DeepSeekNotConfiguredError)) {
      console.warn("[chat-workflow] falling back to deterministic reply", error);
    }
  }

  const reply = createDynamicReply(input.dynamicContext.personaVersionId, input.content, classification);
  return reply ? chatGenerationSchema.parse(reply) : null;
};
