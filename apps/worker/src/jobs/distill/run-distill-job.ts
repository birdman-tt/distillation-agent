import { DeepSeekNotConfiguredError, requestStructuredJson } from "@hall-of-fame/deepseek-client";
import {
  buildDistillSystemPrompt,
  buildDistillUserPrompt,
  distillOutputSchema,
} from "@hall-of-fame/prompt-kit";
import { createWorkflowObserver } from "../../observability/logger.js";
import { runDistillWorkflow } from "../../workflows/distill/run-distill-workflow.js";

export const runDistillJob = async (input: {
  displayName: string;
  distillFocus: string[];
  approvedSources: Array<{
    sourceId: string;
    sourceKind: "PRIMARY" | "SECONDARY" | "SUMMARY";
    title: string | null;
    summary: string;
  }>;
}) => {
  const observer = createWorkflowObserver("distill");

  observer.started("normalize_sources", {
    count: input.approvedSources.length,
  });
  observer.completed("normalize_sources", {
    count: input.approvedSources.length,
  });

  observer.started("build_prompt");
  const systemPrompt = buildDistillSystemPrompt();
  const userPrompt = buildDistillUserPrompt({
    displayName: input.displayName,
    distillFocus: input.distillFocus,
    sources: input.approvedSources,
  });

  let output;
  try {
    output = await requestStructuredJson({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_REASONER_MODEL ?? "deepseek-reasoner",
      systemPrompt,
      userPrompt,
      schema: distillOutputSchema,
      maxTokens: 1400,
    });
    observer.completed("build_prompt", {
      provider: "deepseek",
      recommendedQuestions: output.preview.recommendedQuestions.length,
    });
  } catch (error) {
    if (!(error instanceof DeepSeekNotConfiguredError)) {
      observer.failed("build_prompt", {
        provider: "deepseek",
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
    output = runDistillWorkflow(input);
    observer.completed("build_prompt", {
      provider: "deterministic-fallback",
      recommendedQuestions: output.preview.recommendedQuestions.length,
    });
  }

  observer.completed("persist_candidate_version", {
    coverageScore: output.scores.coverageScore,
    groundingScore: output.scores.groundingScore,
  });

  return output;
};
