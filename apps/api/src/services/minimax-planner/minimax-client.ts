import { chatResearchPlanSchema, chatTurnPlanSchema } from "@hall-of-fame/contracts";
import type { z } from "zod";

export class MiniMaxPlannerNotConfiguredError extends Error {
  constructor() {
    super("MiniMax API key is not configured");
  }
}

export class MiniMaxPlannerParseError extends Error {
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
    this.name = "MiniMaxPlannerParseError";
    this.rawResponse = input.rawResponse;
    this.parsedCandidate = input.parsedCandidate;
    this.normalizedCandidate = input.normalizedCandidate;
  }
}

type ChatTurnPlan = z.infer<typeof chatTurnPlanSchema>;
type ResearchPlan = NonNullable<ChatTurnPlan["researchPlan"]>;

type MiniMaxTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(input: unknown): Promise<unknown>;
};

type MiniMaxMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: MiniMaxToolCall[];
      reasoning_content?: string;
      reasoning_details?: unknown;
    }
  | { role: "tool"; tool_call_id: string; name?: string; content: string };

type MiniMaxToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type MiniMaxResponsePayload = {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: MiniMaxToolCall[];
      reasoning_content?: string;
      reasoning_details?: unknown;
    };
  }>;
  error?: {
    message?: string;
  };
};

const defaultBaseUrl = "https://api.minimaxi.com/v1";

const parseToolArguments = (value: string) => {
  if (!value.trim()) {
    return {};
  }
  return JSON.parse(value) as unknown;
};

const stringifyToolResult = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "Tool result was not JSON serializable" });
  }
};

const parsePlannerJson = (content: string) => {
  const trimmed = content.replace(/<think>[\s\S]*?<\/think>/gu, "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/u);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const json = start >= 0 && end >= start ? candidate.slice(start, end + 1) : candidate;

  const parsed = JSON.parse(json) as unknown;
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (record.ChatTurnPlan && typeof record.ChatTurnPlan === "object") {
      return record.ChatTurnPlan;
    }
    if (record.PlannerDecision && typeof record.PlannerDecision === "object") {
      return record.PlannerDecision;
    }
    if (record.decision && typeof record.decision === "object") {
      return record.decision;
    }
    if (record.plan && typeof record.plan === "object") {
      return record.plan;
    }
  }

  return parsed;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isEmptyLike = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || ["空", "无", "none", "null", "false", "no", "n/a"].includes(normalized);
};

const toStringArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return isEmptyLike(value) ? [] : [value.trim()];
  }
  if (value === false || value === null || value === undefined) {
    return [];
  }
  if (typeof value === "boolean") {
    return value ? ["true"] : [];
  }
  return [String(value)];
};

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
    if (isEmptyLike(normalized) || ["false", "no", "否", "不需要", "0"].includes(normalized)) {
      return false;
    }
  }
  return Boolean(value);
};

const normalizeAnswerMode = (value: unknown) => {
  if (typeof value !== "string") {
    return "casual";
  }
  const normalized = value.trim().toLowerCase();
  if (["domain", "领域", "主题", "专业"].includes(normalized)) {
    return "domain";
  }
  if (["memory_recall", "memory", "recall", "上下文", "记忆"].includes(normalized)) {
    return "memory_recall";
  }
  if (["fresh_info", "fresh", "web", "search", "最新", "联网"].includes(normalized)) {
    return "fresh_info";
  }
  if (["high_risk", "risk", "高风险"].includes(normalized)) {
    return "high_risk";
  }
  if (["proactive_candidate", "proactive", "主动"].includes(normalized)) {
    return "proactive_candidate";
  }
  return "casual";
};

const replyModeFromAnswerMode = (answerMode: string) => {
  switch (answerMode) {
    case "domain":
      return "DOMAIN";
    case "memory_recall":
    case "fresh_info":
      return "FACT";
    case "high_risk":
      return "HIGH_RISK";
    case "proactive_candidate":
    case "casual":
    default:
      return "CASUAL";
  }
};

const normalizeReplyMode = (value: unknown, answerMode: string) => {
  if (typeof value !== "string") {
    return replyModeFromAnswerMode(answerMode);
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "DOMAIN" || normalized === "FACT" || normalized === "HIGH_RISK" || normalized === "CASUAL") {
    return normalized;
  }
  if (["领域", "专业", "主题"].includes(value.trim())) {
    return "DOMAIN";
  }
  if (["事实", "记忆", "上下文", "最新"].includes(value.trim())) {
    return "FACT";
  }
  if (["高风险", "风险"].includes(value.trim())) {
    return "HIGH_RISK";
  }
  return replyModeFromAnswerMode(answerMode);
};

const normalizePersonaIntensity = (value: unknown, replyMode: string) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "low" || normalized === "medium" || normalized === "high") {
      return normalized;
    }
    if (["低", "弱"].includes(value.trim())) {
      return "low";
    }
    if (["中", "中等"].includes(value.trim())) {
      return "medium";
    }
    if (["高", "强"].includes(value.trim())) {
      return "high";
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

const normalizeResearchPlan = (value: unknown, fallbackQuery: string | null): ResearchPlan | null => {
  if (!isPlainRecord(value)) {
    return null;
  }

  const evidenceRequirement = isPlainRecord(value.evidenceRequirement) ? value.evidenceRequirement : {};
  const searchQueries = toStringArray(value.searchQueries).concat(fallbackQuery ? [fallbackQuery] : []).slice(0, 3);
  const subjectType = typeof value.subjectType === "string" ? value.subjectType : "unknown";
  const freshnessRequirement = typeof value.freshnessRequirement === "string" ? value.freshnessRequirement : "latest_available";
  const timeWindow = typeof value.timeWindow === "string" ? value.timeWindow : "latest_available";
  const ifNoReliableSource = value.ifNoReliableSource === "ask_clarify" ? "ask_clarify" : "say_not_found_do_not_guess";

  return chatResearchPlanSchema.parse({
    subject: typeof value.subject === "string" && value.subject.trim() ? value.subject.trim() : null,
    subjectType,
    normalizedQuestion:
      typeof value.normalizedQuestion === "string" && value.normalizedQuestion.trim()
        ? value.normalizedQuestion.trim()
        : fallbackQuery ?? "",
    searchQueries,
    freshnessRequirement,
    timeWindow,
    evidenceRequirement: {
      minSources:
        typeof evidenceRequirement.minSources === "number" && Number.isFinite(evidenceRequirement.minSources)
          ? evidenceRequirement.minSources
          : 1,
      requireUrl:
        typeof evidenceRequirement.requireUrl === "boolean" ? evidenceRequirement.requireUrl : true,
    },
    ifNoReliableSource,
    asOf: typeof value.asOf === "string" ? value.asOf : null,
    timezone: typeof value.timezone === "string" ? value.timezone : null,
    currentYear:
      typeof value.currentYear === "number" && Number.isFinite(value.currentYear)
        ? Math.floor(value.currentYear)
        : null,
  });
};

export const normalizeChatTurnPlanCandidate = (candidate: unknown) => {
  if (!isPlainRecord(candidate)) {
    return candidate;
  }

  const answerMode = normalizeAnswerMode(candidate.answerMode);
  const replyMode = normalizeReplyMode(candidate.replyMode, answerMode);
  const personaIntensity = normalizePersonaIntensity(candidate.personaIntensity, replyMode);

  const proactiveCandidate = (() => {
    const raw = candidate.proactiveCandidate;
    if (!isPlainRecord(raw)) {
      return {
        shouldSchedule: raw === true,
        delaySeconds: null,
        topic: null,
        reason: null,
      };
    }

    return {
      shouldSchedule: Boolean(raw.shouldSchedule),
      delaySeconds:
        typeof raw.delaySeconds === "number" && Number.isFinite(raw.delaySeconds)
          ? Math.max(1, Math.floor(raw.delaySeconds))
          : null,
      topic: typeof raw.topic === "string" && raw.topic.trim() ? raw.topic.trim() : null,
      reason: typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim() : null,
    };
  })();

  const webSearchQuery =
    typeof candidate.webSearchQuery === "string" && candidate.webSearchQuery.trim()
      ? candidate.webSearchQuery.trim()
      : null;

  return {
    ...candidate,
    decisionSource: candidate.decisionSource === "fallback" ? "fallback" : "minimax",
    userIntent: typeof candidate.userIntent === "string" ? candidate.userIntent : String(candidate.userIntent ?? ""),
    replyMode,
    personaIntensity,
    answerMode,
    retrievalHints: isPlainRecord(candidate.retrievalHints)
      ? {
          focusQueries: toStringArray(candidate.retrievalHints.focusQueries),
          boostScopes: toStringArray(candidate.retrievalHints.boostScopes),
        }
      : {
          focusQueries: [],
          boostScopes: [],
        },
    needChatMemory: toBoolean(candidate.needChatMemory),
    needPersonaKnowledge: toBoolean(candidate.needPersonaKnowledge),
    needWebSearch: toBoolean(candidate.needWebSearch),
    webSearchQuery,
    webSearchReason:
      typeof candidate.webSearchReason === "string" && candidate.webSearchReason.trim()
        ? candidate.webSearchReason.trim()
        : null,
    researchPlan: normalizeResearchPlan(candidate.researchPlan, webSearchQuery),
    contextUsed: toStringArray(candidate.contextUsed),
    replyGoal: typeof candidate.replyGoal === "string" ? candidate.replyGoal : String(candidate.replyGoal ?? ""),
    responseOutline: toStringArray(candidate.responseOutline),
    shouldSendMultipleMessages: Boolean(candidate.shouldSendMultipleMessages),
    suggestedMessageCount:
      typeof candidate.suggestedMessageCount === "number" && Number.isFinite(candidate.suggestedMessageCount)
        ? Math.min(3, Math.max(1, Math.floor(candidate.suggestedMessageCount)))
        : 1,
    avoidRepeating: toStringArray(candidate.avoidRepeating),
    proactiveCandidate,
  };
};

const parsePlannerContent = (input: {
  content: string;
  rawResponse: unknown;
}) => {
  const parsedCandidate = parsePlannerJson(input.content);
  const normalizedCandidate = normalizeChatTurnPlanCandidate(parsedCandidate);
  const parsedPlan = chatTurnPlanSchema.safeParse(normalizedCandidate);
  if (!parsedPlan.success) {
    throw new MiniMaxPlannerParseError({
      message: parsedPlan.error.message,
      rawResponse: input.rawResponse,
      parsedCandidate,
      normalizedCandidate,
    });
  }

  return parsedPlan.data;
};

const requestMiniMax = async (input: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  messages: MiniMaxMessage[];
  tools: MiniMaxTool[];
  signal?: AbortSignal;
}) => {
  const baseUrl = input.baseUrl ?? defaultBaseUrl;
  const body: Record<string, unknown> = {
    model: input.model,
    reasoning_split: true,
    messages: input.messages,
  };
  if (input.tools.length > 0) {
    body.tools = input.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    body.tool_choice = "auto";
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    signal: input.signal,
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as MiniMaxResponsePayload;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `MiniMax request failed with ${response.status}`);
  }

  const message = payload.choices?.[0]?.message;
  if (!message) {
    throw new Error("MiniMax returned an empty planner response");
  }

  return {
    payload,
    message,
  };
};

export const runMiniMaxPlannerDecision = async (input: {
  apiKey?: string | null;
  baseUrl?: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
}) => {
  if (!input.apiKey?.trim()) {
    throw new MiniMaxPlannerNotConfiguredError();
  }

  const response = await requestMiniMax({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    model: input.model,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt },
    ],
    tools: [],
    signal: input.signal,
  });

  if (!response.message.content) {
    throw new Error("MiniMax planner returned no decision content");
  }

  return {
    plan: parsePlannerContent({
      content: response.message.content,
      rawResponse: response.payload,
    }),
    rawResponse: response.payload,
  };
};

export const runMiniMaxToolLoop = async (input: {
  apiKey?: string | null;
  baseUrl?: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  tools: MiniMaxTool[];
  maxToolCalls?: number;
  signal?: AbortSignal;
}) => {
  if (!input.apiKey?.trim()) {
    throw new MiniMaxPlannerNotConfiguredError();
  }

  const maxToolCalls = input.maxToolCalls ?? 4;
  const toolsByName = new Map(input.tools.map((tool) => [tool.name, tool]));
  const messages: MiniMaxMessage[] = [
    { role: "system", content: input.systemPrompt },
    { role: "user", content: input.userPrompt },
  ];
  const toolCalls: Array<{ id: string; name: string; arguments: unknown; result: unknown }> = [];
  let rawResponse: unknown = null;

  for (let iteration = 0; iteration <= maxToolCalls; iteration += 1) {
    const response = await requestMiniMax({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      model: input.model,
      messages,
      tools: input.tools,
      signal: input.signal,
    });
    rawResponse = response.payload;

    const assistantMessage: MiniMaxMessage = {
      role: "assistant",
      content: response.message.content ?? "",
      tool_calls: response.message.tool_calls,
      reasoning_content:
        typeof response.message.reasoning_content === "string" ? response.message.reasoning_content : undefined,
      reasoning_details: response.message.reasoning_details,
    };
    messages.push(assistantMessage);

    const requestedTools = response.message.tool_calls ?? [];
    if (requestedTools.length === 0) {
      if (!response.message.content) {
        throw new Error("MiniMax planner returned no plan content");
      }
      return {
        plan: parsePlannerContent({
          content: response.message.content,
          rawResponse,
        }),
        toolCalls,
        rawResponse,
      };
    }

    if (toolCalls.length + requestedTools.length > maxToolCalls) {
      throw new Error(`MiniMax planner exceeded max tool calls (${maxToolCalls})`);
    }

    for (const toolCall of requestedTools) {
      const tool = toolsByName.get(toolCall.function.name);
      const toolArguments = parseToolArguments(toolCall.function.arguments);
      const result = tool
        ? await tool.execute(toolArguments)
        : { error: `Tool ${toolCall.function.name} is not allowed` };
      toolCalls.push({
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolArguments,
        result,
      });
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: stringifyToolResult(result),
      });
    }
  }

  throw new Error(`MiniMax planner exceeded max tool calls (${maxToolCalls})`);
};

export type { ChatTurnPlan, MiniMaxTool };
