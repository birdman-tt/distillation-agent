import { classifyUserQuestion } from "./classification.js";

export type ChatReplyMode = "CASUAL" | "DOMAIN" | "FACT" | "HIGH_RISK";
export type PersonaIntensity = "low" | "medium" | "high";

export type ChatTurnRouting = {
  replyMode: ChatReplyMode;
  personaIntensity: PersonaIntensity;
};

const ACTIONABLE_HIGH_RISK_PATTERN =
  /(该不该|要不要|能不能|可以买|能买吗|买入|卖出|仓位|止损|重仓|荐股|诊断|处方|合同怎么签|怎么避税|移民方案)/iu;

const replyModeForCategory = (category: ReturnType<typeof classifyUserQuestion>["category"]): ChatReplyMode => {
  switch (category) {
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

const personaIntensityForMode = (mode: ChatReplyMode): PersonaIntensity => {
  switch (mode) {
    case "DOMAIN":
      return "high";
    case "FACT":
    case "HIGH_RISK":
      return "medium";
    case "CASUAL":
      return "low";
  }
};

export const routeChatTurn = (input: {
  content: string;
  focusKeywords: string[];
}): ChatTurnRouting => {
  const classification = classifyUserQuestion(input.content, input.focusKeywords);
  const replyMode =
    classification.category === "HIGH_RISK" && classification.matchedKeyword && !ACTIONABLE_HIGH_RISK_PATTERN.test(input.content)
      ? "DOMAIN"
      : replyModeForCategory(classification.category);
  const personaIntensity = personaIntensityForMode(replyMode);

  return {
    replyMode,
    personaIntensity,
  };
};
