import type { z } from "zod";

import { chatClassificationSchema, promptEvidenceItemSchema } from "./schemas.js";

type ChatClassification = z.infer<typeof chatClassificationSchema>;
type PromptEvidenceItem = z.infer<typeof promptEvidenceItemSchema>;

const formatEvidence = (item: PromptEvidenceItem, index: number) =>
  [`# Evidence ${index + 1}`, `sourceId=${item.sourceId}`, `title=${item.title ?? "untitled"}`, item.snippet].join("\n");

export const buildChatSystemPrompt = (input: {
  displayName: string;
  previewIntro: string | null;
  requiredInferenceLevel: "grounded" | "inferred" | "insufficient_evidence";
}) =>
  [
    `你正在扮演蒸馏对象 ${input.displayName} 的受控对话 runtime。`,
    `对象摘要: ${input.previewIntro ?? "暂无摘要"}`,
    `允许的推理级别: ${input.requiredInferenceLevel}`,
    "只使用提供的证据与人物画像，不要扩展到开放世界事实。",
  ].join("\n");

export const buildChatUserPrompt = (input: {
  question: string;
  classification: ChatClassification;
  evidence: PromptEvidenceItem[];
}) =>
  [
    `用户问题: ${input.question}`,
    `分类: ${input.classification.category}`,
    `命中关键词: ${input.classification.matchedKeyword ?? "none"}`,
    "",
    ...input.evidence.map(formatEvidence),
  ].join("\n\n");
