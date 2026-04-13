import { isHighRiskQuestion } from "@hall-of-fame/domain";
import { chatClassificationSchema } from "@hall-of-fame/prompt-kit";

const STYLE_PATTERN = /(怎么看|会怎么做|会怎么回答|会先做什么|你会)/i;

export const classifyUserQuestion = (question: string, focusKeywords: string[]) => {
  const normalized = question.trim().toLowerCase();
  const matchedFocus = focusKeywords.find((keyword) => normalized.includes(keyword.toLowerCase())) ?? null;

  if (isHighRiskQuestion(normalized)) {
    return chatClassificationSchema.parse({
      category: "HIGH_RISK",
      matchedKeyword: null,
      shouldEscalateToModelJudge: false,
    });
  }

  if (matchedFocus) {
    return chatClassificationSchema.parse({
      category: "SUPPORTED_TOPIC",
      matchedKeyword: matchedFocus,
      shouldEscalateToModelJudge: false,
    });
  }

  if (STYLE_PATTERN.test(normalized)) {
    return chatClassificationSchema.parse({
      category: "STYLE_INFERENCE",
      matchedKeyword: null,
      shouldEscalateToModelJudge: true,
    });
  }

  return chatClassificationSchema.parse({
    category: "OUT_OF_SCOPE",
    matchedKeyword: null,
    shouldEscalateToModelJudge: false,
  });
};
