import { chatTurnPlanSchema } from "@hall-of-fame/contracts";
import type { z } from "zod";

type ChatTurnPlan = z.infer<typeof chatTurnPlanSchema>;
type ResearchPlan = NonNullable<ChatTurnPlan["researchPlan"]>;
type FastPlannerProvider = "deepseek" | "kimi";

type FastPlannerResponsePayload = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning_content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

export class FastPlannerNotConfiguredError extends Error {
  constructor(provider: FastPlannerProvider) {
    super(`${provider} planner API key is not configured`);
  }
}

export class FastPlannerParseError extends Error {
  rawResponse: unknown;
  parsedCandidate: unknown;
  normalizedCandidate: unknown;

  constructor(input: {
    message: string;
    rawResponse: unknown;
    parsedCandidate: unknown;
    normalizedCandidate: unknown;
  }) {
    super(input.message);
    this.name = "FastPlannerParseError";
    this.rawResponse = input.rawResponse;
    this.parsedCandidate = input.parsedCandidate;
    this.normalizedCandidate = input.normalizedCandidate;
  }
}

const defaultBaseUrls: Record<FastPlannerProvider, string> = {
  deepseek: "https://api.deepseek.com",
  kimi: "https://api.moonshot.cn/v1",
};

const parsePlannerJson = (content: string) => {
  const trimmed = content.replace(/<think>[\s\S]*?<\/think>/gu, "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/u);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const json = start >= 0 && end >= start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(json) as unknown;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "是", "需要", "1"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "否", "不需要", "0", "none", "null", ""].includes(normalized)) {
      return false;
    }
  }
  return Boolean(value);
};

const normalizeReplyMode = (value: unknown): ChatTurnPlan["replyMode"] => {
  if (typeof value === "number") {
    switch (value) {
      case 1:
        return "DOMAIN";
      case 2:
        return "FACT";
      case 3:
        return "HIGH_RISK";
      case 0:
      default:
        return "CASUAL";
    }
  }
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (normalized === "CASUAL" || normalized === "DOMAIN" || normalized === "FACT" || normalized === "HIGH_RISK") {
      return normalized;
    }
  }
  return "CASUAL";
};

const normalizePersonaIntensity = (value: unknown, replyMode: ChatTurnPlan["replyMode"]): ChatTurnPlan["personaIntensity"] => {
  if (typeof value === "number") {
    if (value <= 0) {
      return "low";
    }
    if (value === 1) {
      return "medium";
    }
    return "high";
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "low" || normalized === "medium" || normalized === "high") {
      return normalized;
    }
  }
  if (replyMode === "DOMAIN") {
    return "high";
  }
  if (replyMode === "FACT" || replyMode === "HIGH_RISK") {
    return "medium";
  }
  return "low";
};

const answerModeForPlan = (input: {
  replyMode: ChatTurnPlan["replyMode"];
  needChatMemory: boolean;
  needWebSearch: boolean;
  proactive: boolean;
}): ChatTurnPlan["answerMode"] => {
  if (input.needWebSearch) {
    return "fresh_info";
  }
  if (input.proactive) {
    return "proactive_candidate";
  }
  if (input.replyMode === "DOMAIN") {
    return "domain";
  }
  if (input.replyMode === "HIGH_RISK") {
    return "high_risk";
  }
  if (input.needChatMemory || input.replyMode === "FACT") {
    return "memory_recall";
  }
  return "casual";
};

const normalizeSubjectType = (value: unknown): ResearchPlan["subjectType"] => {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized === "persona" || normalized === "product" || normalized === "company" || normalized === "event") {
      return normalized;
    }
  }
  return "unknown";
};

const normalizeFreshnessRequirement = (value: unknown) => {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (
      normalized === "latest_available" ||
      normalized === "current" ||
      normalized === "recent" ||
      normalized === "none"
    ) {
      return normalized;
    }
  }
  return "latest_available";
};

const normalizeTimeWindow = (value: unknown) => {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (
      normalized === "today" ||
      normalized === "this_week" ||
      normalized === "this_month" ||
      normalized === "this_year" ||
      normalized === "recent" ||
      normalized === "latest_available" ||
      normalized === "none"
    ) {
      return normalized;
    }
  }
  return "latest_available";
};

const normalizeIfNoReliableSource = (value: unknown) => {
  if (value === "ask_clarify") {
    return "ask_clarify";
  }
  return "say_not_found_do_not_guess";
};

const normalizeSearchQueries = (value: unknown, fallbackQuery: string | null) => {
  const fromArray = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  const candidates = [...fromArray, ...(fallbackQuery ? [fallbackQuery] : [])];
  const seen = new Set<string>();
  return candidates
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    })
    .slice(0, 3);
};

const normalizeResearchPlanCandidate = (candidate: unknown, fallbackQuery: string | null) => {
  if (!isPlainRecord(candidate)) {
    return null;
  }

  const evidenceRequirement = isPlainRecord(candidate.er ?? candidate.evidenceRequirement)
    ? (candidate.er ?? candidate.evidenceRequirement) as Record<string, unknown>
    : {};
  const searchQueries = normalizeSearchQueries(candidate.qs ?? candidate.searchQueries, fallbackQuery);

  return {
    subject:
      typeof (candidate.s ?? candidate.subject) === "string" && String(candidate.s ?? candidate.subject).trim()
        ? String(candidate.s ?? candidate.subject).trim()
        : null,
    subjectType: normalizeSubjectType(candidate.st ?? candidate.subjectType),
    normalizedQuestion:
      typeof (candidate.nq ?? candidate.normalizedQuestion) === "string" &&
      String(candidate.nq ?? candidate.normalizedQuestion).trim()
        ? String(candidate.nq ?? candidate.normalizedQuestion).trim()
        : fallbackQuery ?? "",
    searchQueries,
    freshnessRequirement: normalizeFreshnessRequirement(candidate.fr ?? candidate.freshnessRequirement),
    timeWindow: normalizeTimeWindow(candidate.tw ?? candidate.timeWindow),
    evidenceRequirement: {
      minSources:
        typeof (evidenceRequirement.ms ?? evidenceRequirement.minSources) === "number"
          ? evidenceRequirement.ms ?? evidenceRequirement.minSources
          : 1,
      requireUrl:
        typeof (evidenceRequirement.url ?? evidenceRequirement.requireUrl) === "boolean"
          ? evidenceRequirement.url ?? evidenceRequirement.requireUrl
          : true,
    },
    ifNoReliableSource: normalizeIfNoReliableSource(candidate.nf ?? candidate.ifNoReliableSource),
    asOf: null,
    timezone: null,
    currentYear: null,
  };
};

const normalizeFastPlannerCandidate = (candidate: unknown): ChatTurnPlan => {
  if (!isPlainRecord(candidate)) {
    throw new FastPlannerParseError({
      message: "Fast planner returned a non-object decision",
      rawResponse: candidate,
      parsedCandidate: candidate,
      normalizedCandidate: candidate,
    });
  }

  const replyMode = normalizeReplyMode(candidate.m ?? candidate.replyMode);
  const needChatMemory = toBoolean(candidate.cm ?? candidate.needChatMemory);
  const needPersonaKnowledge = toBoolean(candidate.pk ?? candidate.needPersonaKnowledge);
  const needWebSearch = toBoolean(candidate.ws ?? candidate.needWebSearch);
  const proactive = toBoolean(candidate.pro ?? (isPlainRecord(candidate.proactiveCandidate) ? candidate.proactiveCandidate.shouldSchedule : candidate.proactiveCandidate));
  const webSearchQuery =
    typeof (candidate.q ?? candidate.webSearchQuery) === "string" && String(candidate.q ?? candidate.webSearchQuery).trim()
      ? String(candidate.q ?? candidate.webSearchQuery).trim()
      : null;
  const personaIntensity = normalizePersonaIntensity(candidate.i ?? candidate.personaIntensity, replyMode);
  const researchPlan = normalizeResearchPlanCandidate(candidate.rp ?? candidate.researchPlan, webSearchQuery);
  const answerMode = answerModeForPlan({
    replyMode,
    needChatMemory,
    needWebSearch,
    proactive,
  });

  return chatTurnPlanSchema.parse({
    decisionSource: "fast_planner",
    userIntent: typeof candidate.userIntent === "string" ? candidate.userIntent : "Fast planner compact decision",
    replyMode,
    personaIntensity,
    answerMode,
    retrievalHints: {
      focusQueries: webSearchQuery ? [webSearchQuery] : [],
      boostScopes: [
        ...(needChatMemory ? ["chat_memory" as const] : []),
        ...(needPersonaKnowledge ? ["persona_chunks" as const] : []),
      ],
    },
    needChatMemory,
    needPersonaKnowledge,
    needWebSearch,
    webSearchQuery,
    webSearchReason: needWebSearch ? "Fast planner requested web search." : null,
    researchPlan,
    contextUsed: [],
    replyGoal: "根据 planner 决策选择上下文和回复模式。",
    responseOutline: [],
    shouldSendMultipleMessages: false,
    suggestedMessageCount: 1,
    avoidRepeating: [],
    proactiveCandidate: {
      shouldSchedule: proactive,
      delaySeconds: proactive ? null : null,
      topic: proactive ? webSearchQuery : null,
      reason: proactive ? "Fast planner detected an explicit proactive request." : null,
    },
  });
};

export const buildFastPlannerSystemPrompt = () =>
  [
    "你是聊天后端的 fast planner，只输出 JSON object，不要解释，不要写用户可见回复。",
    "你的任务是做上下文依赖判断，不是关键词规则路由器。",
    "不要因为出现单个词就机械选择工具；要结合 user prompt 里的当前消息、最近上下文、persona context 和服务器时间判断最终回复是否缺上下文。",
    "字段：m=0闲聊/1领域主张/2事实记忆或最新信息/3高风险现实决策。",
    "字段：i=0低人格显露/1中/2高；cm=是否需要聊天记忆；pk=是否需要人物资料；ws=是否需要联网；q=首选联网搜索词或 null；pro=是否需要稍后主动提醒。",
    "可以直接自然回应时，cm=false、pk=false、ws=false、pro=false。",
    "缺用户历史或偏好时选择 cm；缺对象资料、生平、观点、口吻或资料依据时选择 pk；缺外部证据、现实世界变化或过期风险时选择 ws；需要多个上下文时可以同时选择多个工具。",
    "如果 ws 为 true，必须输出 rp。rp 是 researchPlan：s=搜索主体；st=persona/product/company/event/unknown；nq=规范化事实问题；qs=1-3 条可直接搜索的查询；fr=latest_available/current/recent/none；tw=today/this_week/this_month/this_year/recent/latest_available/none；nf=say_not_found_do_not_guess/ask_clarify。",
    "当用户说“你/你的”，默认指当前 persona；搜索词不能只包含“你/这个/那个”等指代，必须写出明确主体。",
    "如果需要外部证据或时间敏感事实，按 user prompt 里的服务器时间和当前年份生成搜索词。",
    "pro 默认 false；只有用户明确要求延后继续、通知或主动跟进时才设为 true。",
    '只输出类似：{"m":0,"i":0,"cm":false,"pk":false,"ws":false,"q":null,"rp":null,"pro":false}',
    '需要联网时类似：{"m":2,"i":1,"cm":true,"pk":true,"ws":true,"q":"罗永浩 最近 访谈 嘉宾 2026","rp":{"s":"罗永浩","st":"persona","nq":"最近一次访谈邀请的嘉宾是谁","qs":["罗永浩 最近 访谈 嘉宾 2026","罗永浩 最新访谈 嘉宾"],"fr":"latest_available","tw":"recent","nf":"say_not_found_do_not_guess"},"pro":false}',
  ].join("\n");

export const runFastPlannerDecision = async (input: {
  provider: FastPlannerProvider;
  apiKey?: string | null;
  baseUrl?: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}) => {
  if (!input.apiKey?.trim()) {
    throw new FastPlannerNotConfiguredError(input.provider);
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${(input.baseUrl ?? defaultBaseUrls[input.provider]).replace(/\/$/u, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    signal: input.signal,
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      max_tokens: 420,
      response_format: {
        type: "json_object",
      },
      thinking: {
        type: "disabled",
      },
      messages: [
        {
          role: "system",
          content: input.systemPrompt,
        },
        {
          role: "user",
          content: input.userPrompt,
        },
      ],
    }),
  });

  const payload = (await response.json()) as FastPlannerResponsePayload;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `${input.provider} planner request failed with ${response.status}`);
  }

  const content = payload.choices?.[0]?.message?.content ?? null;
  if (!content) {
    throw new Error(`${input.provider} planner returned no decision content`);
  }

  const parsedCandidate = parsePlannerJson(content);
  try {
    return {
      plan: normalizeFastPlannerCandidate(parsedCandidate),
      rawResponse: payload,
    };
  } catch (error) {
    if (error instanceof FastPlannerParseError) {
      throw error;
    }
    throw new FastPlannerParseError({
      message: error instanceof Error ? error.message : "Fast planner parse failed",
      rawResponse: payload,
      parsedCandidate,
      normalizedCandidate: parsedCandidate,
    });
  }
};

export type { FastPlannerProvider };
