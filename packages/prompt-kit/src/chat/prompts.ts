import type { z } from "zod";

import { chatClassificationSchema, promptEvidenceItemSchema } from "./schemas.js";

type ChatClassification = z.infer<typeof chatClassificationSchema>;
type PromptEvidenceItem = z.infer<typeof promptEvidenceItemSchema>;

const formatEvidence = (item: PromptEvidenceItem, index: number) =>
  [`# Evidence ${index + 1}`, `sourceId=${item.sourceId}`, `title=${item.title ?? "untitled"}`, item.snippet].join("\n");

const formatRecentTurn = (
  item: {
    role: "SYSTEM" | "USER" | "ASSISTANT";
    content: string;
  },
  index: number,
) => [`# Turn ${index + 1}`, `role=${item.role}`, item.content].join("\n");

const formatRetrievedMemory = (
  item: {
    role: "SYSTEM" | "USER" | "ASSISTANT";
    content: string;
    reason: string;
    turnDistance: number;
  },
  index: number,
) => [`# Memory ${index + 1}`, `role=${item.role}`, `reason=${item.reason}`, `turnDistance=${item.turnDistance}`, item.content].join("\n");

const formatSection = (title: string, entries: string[]) => [title, ...(entries.length ? entries : ["none"])].join("\n\n");

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
    `内部参考的回答姿态: ${input.requiredInferenceLevel}`,
    "目标是让用户感觉自己正在和这个人格聊天，而不是在读一份检索报告。",
    "资料与人物画像的作用，是约束人格、语气、价值取向、判断框架和边界，而不是限制用户能问什么。",
    "不要因为问题没有命中关键词、推荐问题或现成主题就拒答；默认要继续自然对话。",
    "开放式、观点式、策略式问题，即使没有直接证据，也可以依据人物画像自然作答。",
    "如果问题在追问具体事实、具体经历、具体原话，而现有信息没有直接覆盖：不能编造新的具体事实、日期、地点、人物关系、经历细节或原话。",
    "遇到这类未直接覆盖的事实追问时，仍然保持人物口吻，但只给抽象态度、判断框架和价值取向，不要把未经支持的细节说死。",
    "如果问题属于投资、医疗、法律、税务、移民、合同等高风险现实决策，继续保持人物口吻，但只能给原则、提醒、边界与思考框架，不要给步骤、结论、操作建议或确定性判断。",
    "除非完全无法安全继续，否则不要把“资料不足”“证据不足”“推断级别”之类的系统话术直接说给用户。",
    "回答优先使用第一人称，保持自然、克制、像人，不要像系统警报。",
    "对象摘要、参考口吻、推荐问题都只是内部风格线索，不要把它们原句抄成回答开头。",
    "如果 recent turns 或 retrieved memory 里出现你自己之前说过的话，只承接其中的意思，不要直接复述原句或重复固定套话。",
    "最终响应必须是一个合法 JSON object，并严格匹配约定字段。",
    '返回字段必须且只能包含: "answer", "basisSummary", "inferenceLevel", "conflictDetected", "refusalReason"。',
    '其中 "basisSummary" 必须是对象: {"mode":"SUPPORTED|INFERRED|UNSUPPORTED","summary":"string"}。',
    '不要输出 Markdown，不要输出代码块，不要省略字段，不要附加解释文本。',
  ].join("\n");

export const buildChatUserPrompt = (input: {
  question: string;
  classification: ChatClassification;
  recentTurns?: Array<{
    role: "SYSTEM" | "USER" | "ASSISTANT";
    content: string;
  }>;
  retrievedMemories?: Array<{
    role: "SYSTEM" | "USER" | "ASSISTANT";
    content: string;
    reason: string;
    turnDistance: number;
  }>;
  evidence: PromptEvidenceItem[];
}) =>
  [
    formatSection(
      "[Recent Conversation Window]",
      (input.recentTurns ?? []).map(formatRecentTurn),
    ),
    formatSection(
      "[Retrieved Chat Memory]",
      (input.retrievedMemories ?? []).map(formatRetrievedMemory),
    ),
    formatSection("[Persona Evidence]", input.evidence.map(formatEvidence)),
    "[Current User Message]",
    input.question,
    `问题提示: ${input.classification.category}`,
    `主题锚点: ${input.classification.matchedKeyword ?? "none"}`,
    "上面的分类与主题锚点只是提示，不是硬限制；请你自己判断怎样既像这个人格，又不越界。",
  ].join("\n\n");
