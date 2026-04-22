import { personaProfileSchema } from "@hall-of-fame/domain";
import {
  buildDistillSystemPrompt,
  buildDistillUserPrompt,
  distillOutputSchema,
} from "@hall-of-fame/prompt-kit";

type DistillSourceFragment = {
  sourceId: string;
  sourceKind: "PRIMARY" | "SECONDARY" | "SUMMARY";
  title: string | null;
  summary: string;
};

const uniqueBySourceId = (sources: DistillSourceFragment[]) => {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.sourceId)) {
      return false;
    }
    seen.add(source.sourceId);
    return true;
  });
};

export const runDistillWorkflow = (input: {
  displayName: string;
  distillFocus: string[];
  approvedSources: DistillSourceFragment[];
}) => {
  const normalizedSources = uniqueBySourceId(input.approvedSources).map((source) => ({
    ...source,
    summary: source.summary.trim(),
  }));

  const prompt = {
    system: buildDistillSystemPrompt(),
    user: buildDistillUserPrompt({
      displayName: input.displayName,
      distillFocus: input.distillFocus,
      sources: normalizedSources,
    }),
  };
  void prompt;

  const primaryFocus = input.distillFocus[0] ?? "观点";
  const profile = personaProfileSchema.parse({
    summary: `${input.displayName} 当前被蒸馏成一个强调 ${input.distillFocus.join("、") || "人物观点"} 的对象。`,
    roles: ["蒸馏对象"],
    coreBeliefs: [`优先从 ${primaryFocus} 解释问题`],
    reasoningPatterns: ["先界定问题，再给出偏好性结论"],
    speakingStyle: ["克制", "结构化", "偏判断型"],
    signaturePhrases: [`先从${primaryFocus}来界定问题`],
    topicStrengths: input.distillFocus,
    topicUnknowns: ["未覆盖的生平细节", "缺少直接资料支撑的现实建议"],
    taboosOrBoundaries: ["不回答高风险现实决策", "证据不足时主动降级"],
  });

  return distillOutputSchema.parse({
    profile,
    preview: {
      previewIntro: `基于 ${normalizedSources.length} 份已审核资料蒸馏出的 ${input.displayName} 对象，当前更偏 ${input.distillFocus.join("、")}。`,
      recommendedQuestions: [
        `如果从 ${primaryFocus} 来看，${input.displayName} 会怎么回答？`,
        `${input.displayName} 在面对冲突时会先考虑什么？`,
        `站在 ${input.displayName} 的角度，应该先做什么？`,
      ],
      sampleAnswers: [
        `${input.displayName} 会先用 ${primaryFocus} 的框架界定问题，再给出偏好性判断。`,
        `如果证据还不够，当前对象会倾向给出边界而不是给出确定答案。`,
      ],
    },
    scores: {
      coverageScore: Math.min(100, 40 + normalizedSources.length * 10),
      groundingScore: Math.min(100, 50 + normalizedSources.length * 8),
      styleScore: Math.min(100, 55 + input.distillFocus.length * 8),
      riskScore: normalizedSources.some((item) => item.sourceKind === "SUMMARY") ? 25 : 20,
    },
  });
};
