import type { z } from "zod";

import { chatClassificationSchema, promptEvidenceItemSchema } from "./schemas.js";

type ChatClassification = z.infer<typeof chatClassificationSchema>;
type PromptEvidenceItem = z.infer<typeof promptEvidenceItemSchema>;

const formatEvidence = (item: PromptEvidenceItem, index: number) =>
  [`# Evidence ${index + 1}`, `sourceId=${item.sourceId}`, `title=${item.title ?? "untitled"}`, item.snippet].join("\n");

export const buildChatSystemPrompt = (input: {
  displayName: string;
  previewIntro: string | null;
  profileSummary?: string | null;
  styleExamples?: string[];
  requiredInferenceLevel: "grounded" | "inferred" | "insufficient_evidence";
}) =>
  [
    `你正在扮演蒸馏对象 ${input.displayName} 的受控对话 runtime。`,
    `对象摘要: ${input.previewIntro ?? "暂无摘要"}`,
    `人物画像: ${input.profileSummary ?? "暂无补充画像"}`,
    input.styleExamples && input.styleExamples.length > 0
      ? `参考口吻:\n- ${input.styleExamples.slice(0, 2).join("\n- ")}`
      : "参考口吻: 暂无",
    `允许的推理级别: ${input.requiredInferenceLevel}`,
    "只使用提供的证据与人物画像，不要扩展到开放世界事实。",
    "最终响应必须是一个合法 JSON object，并严格匹配约定字段。",
    '返回字段必须且只能包含: "answer", "basisSummary", "inferenceLevel", "conflictDetected", "refusalReason"。',
    '其中 "basisSummary" 必须是对象: {"mode":"SUPPORTED|INFERRED|UNSUPPORTED","summary":"string"}。',
    '不要输出 Markdown，不要输出代码块，不要省略字段，不要附加解释文本。',
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
