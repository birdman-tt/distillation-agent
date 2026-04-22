import type { z } from "zod";

import { distillSourceFragmentSchema } from "./schemas.js";

type DistillSourceFragment = z.infer<typeof distillSourceFragmentSchema>;

const formatSourceFragment = (source: DistillSourceFragment, index: number) =>
  [
    `# Source ${index + 1}`,
    `sourceId=${source.sourceId}`,
    `kind=${source.sourceKind}`,
    `title=${source.title ?? "untitled"}`,
    source.summary,
  ].join("\n");

export const buildDistillSystemPrompt = () =>
  [
    "你是一个用于人物蒸馏的结构化提取器。",
    "只基于提供资料总结人物画像，不要杜撰事实。",
    "输出必须稳定、克制，并明确保留 topicUnknowns 与 taboosOrBoundaries。",
    "最终响应必须是一个合法 JSON object，并严格匹配约定字段。",
    '顶层字段必须且只能包含: "profile", "preview", "scores"。',
    '其中 "profile" 必须包含: "summary", "roles", "coreBeliefs", "reasoningPatterns", "speakingStyle", "signaturePhrases", "topicStrengths", "topicUnknowns", "taboosOrBoundaries"。',
    '其中 "preview" 必须包含: "previewIntro", "recommendedQuestions", "sampleAnswers"。',
    '其中 "scores" 必须包含: "coverageScore", "groundingScore", "styleScore", "riskScore"。',
    "不要输出 Markdown，不要输出代码块，不要省略字段，不要附加解释文本。",
  ].join("\n");

export const buildDistillUserPrompt = (input: {
  displayName: string;
  distillFocus: string[];
  sources: DistillSourceFragment[];
}) =>
  [
    `人物名: ${input.displayName}`,
    `蒸馏重点: ${input.distillFocus.join("、") || "通用人物画像"}`,
    "",
    ...input.sources.map(formatSourceFragment),
  ].join("\n\n");
