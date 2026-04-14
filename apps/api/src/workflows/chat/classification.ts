import { isHighRiskQuestion } from "@hall-of-fame/domain";
import { chatClassificationSchema } from "@hall-of-fame/prompt-kit";

const FACT_PATTERN =
  /(哪年|哪一年|什么时候|当时|当年|具体|原话|是否|有没有|哪里|哪儿|谁|哪次|几岁|多少|是不是|是否说过|是否做过|亲自|本人|是真的吗)/i;
export const classifyUserQuestion = (question: string, focusKeywords: string[]) => {
  const normalized = question.trim().toLowerCase();
  const matchedFocus = focusKeywords.find((keyword) => normalized.includes(keyword.toLowerCase())) ?? null;

  if (isHighRiskQuestion(normalized)) {
    return chatClassificationSchema.parse({
      category: "HIGH_RISK",
      matchedKeyword: matchedFocus,
      shouldEscalateToModelJudge: true,
    });
  }

  if (FACT_PATTERN.test(normalized)) {
    return chatClassificationSchema.parse({
      category: "FACT_SPECIFIC",
      matchedKeyword: matchedFocus,
      shouldEscalateToModelJudge: true,
    });
  }

  if (matchedFocus) {
    return chatClassificationSchema.parse({
      category: "THEME_ANCHORED",
      matchedKeyword: matchedFocus,
      shouldEscalateToModelJudge: true,
    });
  }

  return chatClassificationSchema.parse({
    category: "OPEN_ENDED",
    matchedKeyword: null,
    shouldEscalateToModelJudge: true,
  });
};
