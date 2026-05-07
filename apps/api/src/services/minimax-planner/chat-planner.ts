import { chatTurnPlanSchema } from "@hall-of-fame/contracts";
import type { z } from "zod";

import { listRecentChatMessages } from "../../store/chat-store.js";
import {
  buildFastPlannerSystemPrompt,
  FastPlannerNotConfiguredError,
  FastPlannerParseError,
  runFastPlannerDecision,
  type FastPlannerProvider,
} from "./fast-planner-client.js";
import {
  MiniMaxPlannerNotConfiguredError,
  MiniMaxPlannerParseError,
  runMiniMaxPlannerDecision,
} from "./minimax-client.js";

type ChatTurnPlan = z.infer<typeof chatTurnPlanSchema>;
type PlannerReplyMode = ChatTurnPlan["replyMode"];
type PlannerPersonaIntensity = ChatTurnPlan["personaIntensity"];

type PlannerPersonaContext = {
  displayName: string;
  previewIntro: string | null;
  profileSummary: string | null;
};

type PlannerRuntimeContext = {
  nowIso: string;
  dateLabel: string;
  timezone: string;
  currentYear: number;
};

type PlannerTraceSink = (event: {
  eventName: string;
  stage: string;
  status: string;
  level?: "info" | "warn" | "error";
  durationMs?: number;
  fields?: Record<string, unknown>;
  artifacts?: Array<
    | {
        artifactKey: string;
        kind: "json";
        value: unknown;
        contentType?: string;
      }
    | {
        artifactKey: string;
        kind: "text";
        value: string;
        contentType?: string;
      }
  >;
}) => void;

const readPlannerMode = () => process.env.CHAT_PLANNER_MODE ?? "decision";
export const isChatPlannerEnabled = () =>
  process.env.CHAT_PLANNER_ENABLED === "true" && readPlannerMode() === "decision";
export const isChatProactiveEnabled = () => process.env.CHAT_PROACTIVE_ENABLED === "true";

type PlannerProvider = FastPlannerProvider | "minimax";

const readPlannerTimeoutMs = () => Number(process.env.CHAT_PLANNER_TIMEOUT_MS ?? "3000");
const readPlannerProvider = (): PlannerProvider => {
  const raw = (process.env.CHAT_FAST_PLANNER_PROVIDER ?? process.env.CHAT_PLANNER_PROVIDER ?? "deepseek")
    .trim()
    .toLowerCase();
  if (raw === "kimi" || raw === "minimax") {
    return raw;
  }
  return "deepseek";
};
const readPlannerModel = (provider: PlannerProvider) => {
  if (provider === "minimax") {
    return process.env.MINIMAX_PLANNER_MODEL ?? "MiniMax-M2.7";
  }
  if (provider === "kimi") {
    return process.env.CHAT_FAST_PLANNER_MODEL ?? process.env.KIMI_MODEL ?? "kimi-k2.6";
  }
  return process.env.CHAT_FAST_PLANNER_MODEL ?? process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-v4-flash";
};
const readPlannerApiKey = (provider: PlannerProvider) => {
  if (provider === "minimax") {
    return process.env.MINIMAX_API_KEY;
  }
  if (provider === "kimi") {
    return process.env.CHAT_FAST_PLANNER_API_KEY ?? process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY;
  }
  return process.env.CHAT_FAST_PLANNER_API_KEY ?? process.env.DEEPSEEK_API_KEY;
};
const readPlannerBaseUrl = (provider: PlannerProvider) => {
  if (provider === "minimax") {
    return process.env.MINIMAX_BASE_URL;
  }
  if (provider === "kimi") {
    return process.env.CHAT_FAST_PLANNER_BASE_URL ?? process.env.KIMI_BASE_URL ?? process.env.MOONSHOT_BASE_URL;
  }
  return process.env.CHAT_FAST_PLANNER_BASE_URL ?? process.env.DEEPSEEK_BASE_URL;
};
const readRuntimeTimeZone = () => process.env.CHAT_RUNTIME_TIME_ZONE ?? "Asia/Shanghai";

export const buildPlannerRuntimeContext = (date = new Date()): PlannerRuntimeContext => {
  const timezone = readRuntimeTimeZone();
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
  const currentYear = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
    }).format(date),
  );

  return {
    nowIso: date.toISOString(),
    dateLabel: parts,
    timezone,
    currentYear,
  };
};

export const isExplicitProactiveRequest = (content: string) =>
  /(提醒|稍后|一会儿|一会|等下|待会|过会|回头|晚点|明天|下次|别忘|分钟后|小时后|天后|remind|later|follow up)/iu.test(content);

export const shouldRunChatPlannerForTurn = (content: string) => {
  return {
    shouldRun: true,
    reason: "every_turn" as const,
  };
};

const freshInfoPattern =
  /(今天|现在|当前|这个月|本月|几月|几月份|今年|几年|几几年|哪一年|日期|时间|最新|最近|新闻|新上市|上市|发布|发生了什么|实时|本周|latest|today|recent|current|news)/iu;
const memoryRecallPattern =
  /(刚才|上次|之前|前面|继续|记得|还记得|我叫什么|我的名字|我叫|我的外号|我的偏好|我说过|上回|last time|remember)/iu;

const isFreshInfoFallbackRequest = (content: string) => freshInfoPattern.test(content);
const isMemoryRecallRequest = (content: string) => memoryRecallPattern.test(content);

const answerModeForReplyMode = (replyMode: PlannerReplyMode): ChatTurnPlan["answerMode"] => {
  switch (replyMode) {
    case "DOMAIN":
      return "domain";
    case "FACT":
      return "memory_recall";
    case "HIGH_RISK":
      return "high_risk";
    case "CASUAL":
    default:
      return "casual";
  }
};

const buildFallbackChatTurnPlan = (input: {
  content: string;
  fallbackReplyMode: PlannerReplyMode;
  fallbackPersonaIntensity: PlannerPersonaIntensity;
}): ChatTurnPlan => {
  const needsFreshInfo = isFreshInfoFallbackRequest(input.content);
  if (needsFreshInfo) {
    return {
      decisionSource: "fallback",
      userIntent: "Planner failed; fallback detected a current-date or fresh-information request.",
      replyMode: "FACT",
      personaIntensity: "medium",
      answerMode: "fresh_info",
      retrievalHints: {
        focusQueries: [input.content],
        boostScopes: ["chat_memory", "persona_chunks"],
      },
      needChatMemory: true,
      needPersonaKnowledge: true,
      needWebSearch: true,
      webSearchQuery: input.content,
      webSearchReason: "Planner failed; fallback detected current-date or fresh-information wording.",
      researchPlan: null,
      contextUsed: [],
      replyGoal: "先回答当前日期；涉及最新信息时使用联网结果，搜索不可用时明确不确定，不要编造。",
      responseOutline: ["先用服务端日期回答当前月份和年份", "再结合联网结果评价用户问到的最新对象", "如果联网不可用，只说明无法确认最新信息"],
      shouldSendMultipleMessages: false,
      suggestedMessageCount: 1,
      avoidRepeating: [],
      proactiveCandidate: {
        shouldSchedule: false,
        delaySeconds: null,
        topic: null,
        reason: null,
      },
    };
  }

  return {
    decisionSource: "fallback",
    userIntent: "Planner failed; using local turn routing fallback.",
    replyMode: input.fallbackReplyMode,
    personaIntensity: input.fallbackPersonaIntensity,
    answerMode: answerModeForReplyMode(input.fallbackReplyMode),
    retrievalHints: {
      focusQueries: [],
      boostScopes: [],
    },
    needChatMemory: true,
    needPersonaKnowledge: true,
    needWebSearch: false,
    webSearchQuery: null,
    webSearchReason: null,
    researchPlan: null,
    contextUsed: [],
    replyGoal: "按本地路由继续自然回复。",
    responseOutline: ["自然回应用户当前消息"],
    shouldSendMultipleMessages: false,
    suggestedMessageCount: 1,
    avoidRepeating: [],
    proactiveCandidate: {
      shouldSchedule: false,
      delaySeconds: null,
      topic: null,
      reason: null,
    },
  };
};

const shouldUseFallbackDecision = (plan: ChatTurnPlan) =>
  plan.needWebSearch || plan.proactiveCandidate.shouldSchedule;

const unique = <T>(items: T[]) => [...new Set(items)];

const minPersonaIntensity = (
  value: PlannerPersonaIntensity,
  minimum: PlannerPersonaIntensity,
): PlannerPersonaIntensity => {
  const rank: Record<PlannerPersonaIntensity, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };
  return rank[value] >= rank[minimum] ? value : minimum;
};

const applyHardGuardOverrides = (input: {
  content: string;
  plan: ChatTurnPlan;
}): { plan: ChatTurnPlan; applied: boolean } => {
  let applied = false;
  const needsFreshInfo = isFreshInfoFallbackRequest(input.content);
  const needsMemory = isMemoryRecallRequest(input.content);
  const needsProactive = isExplicitProactiveRequest(input.content);
  const plan: ChatTurnPlan = {
    ...input.plan,
    retrievalHints: {
      focusQueries: [...input.plan.retrievalHints.focusQueries],
      boostScopes: [...input.plan.retrievalHints.boostScopes],
    },
    proactiveCandidate: {
      ...input.plan.proactiveCandidate,
    },
    researchPlan: input.plan.researchPlan ? { ...input.plan.researchPlan } : null,
  };

  if (needsFreshInfo && (!plan.needWebSearch || (!plan.researchPlan && plan.webSearchQuery !== input.content))) {
    applied = true;
    plan.needWebSearch = true;
    plan.webSearchQuery = plan.researchPlan?.searchQueries[0] ?? input.content;
    plan.webSearchReason = plan.webSearchReason ?? "Hard guard detected current/fresh information wording.";
  }

  if (needsFreshInfo) {
    applied = true;
    plan.replyMode = "FACT";
    plan.personaIntensity = minPersonaIntensity(plan.personaIntensity, "medium");
    plan.answerMode = "fresh_info";
    plan.needChatMemory = true;
    plan.needPersonaKnowledge = true;
    plan.retrievalHints.focusQueries = unique([input.content, ...plan.retrievalHints.focusQueries]);
    plan.retrievalHints.boostScopes = unique([
      "chat_memory",
      "persona_chunks",
      ...plan.retrievalHints.boostScopes,
    ]);
  }

  if (needsMemory && !plan.needChatMemory) {
    applied = true;
    plan.needChatMemory = true;
    plan.replyMode = plan.replyMode === "CASUAL" ? "FACT" : plan.replyMode;
    plan.personaIntensity = minPersonaIntensity(plan.personaIntensity, "medium");
    plan.answerMode = plan.answerMode === "casual" ? "memory_recall" : plan.answerMode;
    plan.retrievalHints.boostScopes = unique(["chat_memory", ...plan.retrievalHints.boostScopes]);
  }

  if (needsProactive && !plan.proactiveCandidate.shouldSchedule) {
    applied = true;
    plan.proactiveCandidate = {
      shouldSchedule: true,
      delaySeconds: null,
      topic: input.content,
      reason: "Hard guard detected an explicit proactive request.",
    };
    plan.answerMode = "proactive_candidate";
  }

  return {
    plan,
    applied,
  };
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string, onTimeout?: () => void) => {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout?.();
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const buildPlannerSystemPrompt = () =>
  [
    "你是聊天后端的 Agent Planner，不直接写用户可见回复。",
    "每一轮都要判断当前用户消息和最近上下文是否需要工具增强。",
    "你只做工具选择决策，不直接回复用户，也不要调用工具。",
    "后端会根据你的 JSON 决策执行 chat memory、persona knowledge、Kimi web search 或 proactive job。",
    "如果用户只是问候、认同、轻松寒暄，通常 needChatMemory=false、needPersonaKnowledge=false、needWebSearch=false。",
    "如果用户纠正上一轮、追问刚才、问自己此前说过的信息，例如名字、外号、偏好、地点、计划、上次说过什么，needChatMemory=true。",
    "如果问题涉及人物核心领域、观点框架或需要从人物资料中取依据，needPersonaKnowledge=true。",
    "如果用户问最新、今天、现在、近期新闻、新上市、实时、模型知识可能过期的事实，needWebSearch=true，并给出可直接搜索的 webSearchQuery 和 researchPlan。",
    "researchPlan 用来告诉 Kimi 怎么搜索。用户说“你/你的”时，默认指当前 persona；searchQueries 不能只包含“你/这个/那个”等指代词，必须写出明确主体。",
    "生成 researchPlan 时必须以 Runtime Context 的 nowIso/timezone/currentYear 为时间基准，不要凭模型记忆猜当前年份。",
    "如果当前消息本身像普通纠错，但最近上下文正在讨论最新事实，也应把 needWebSearch 设为 true。",
    "把你依赖的上下文线索写进 contextUsed 和 responseOutline，供最终 responder 使用。",
    "最终必须只输出一个 JSON object，不要输出 Markdown，不要解释。",
    "严格按这个 TypeScript 形状输出：",
    "{",
    '  "userIntent": string,',
    '  "replyMode": "CASUAL" | "DOMAIN" | "FACT" | "HIGH_RISK",',
    '  "personaIntensity": "low" | "medium" | "high",',
    '  "answerMode": "casual" | "domain" | "memory_recall" | "fresh_info" | "high_risk" | "proactive_candidate",',
    '  "retrievalHints": {',
    '    "focusQueries": string[],',
    '    "boostScopes": ("user_facts" | "chat_memory" | "persona_chunks")[]',
    "  },",
    '  "needChatMemory": boolean,',
    '  "needPersonaKnowledge": boolean,',
    '  "needWebSearch": boolean,',
    '  "webSearchQuery": string | null,',
    '  "webSearchReason": string | null,',
    '  "researchPlan": {',
    '    "subject": string | null,',
    '    "subjectType": "persona" | "product" | "company" | "event" | "unknown",',
    '    "normalizedQuestion": string,',
    '    "searchQueries": string[],',
    '    "freshnessRequirement": "latest_available" | "current" | "recent" | "none",',
    '    "timeWindow": "today" | "this_week" | "this_month" | "this_year" | "recent" | "latest_available" | "none",',
    '    "evidenceRequirement": {"minSources": number, "requireUrl": boolean},',
    '    "ifNoReliableSource": "say_not_found_do_not_guess" | "ask_clarify",',
    '    "asOf": string | null,',
    '    "timezone": string | null,',
    '    "currentYear": number | null',
    "  } | null,",
    '  "contextUsed": string[],',
    '  "replyGoal": string,',
    '  "responseOutline": string[],',
    '  "shouldSendMultipleMessages": boolean,',
    '  "suggestedMessageCount": 1 | 2 | 3,',
    '  "avoidRepeating": string[],',
    '  "proactiveCandidate": {',
    '    "shouldSchedule": boolean,',
    '    "delaySeconds": number | null,',
    '    "topic": string | null,',
    '    "reason": string | null',
    "  }",
    "}",
    "replyMode 控制最终回复形态：普通闲聊 CASUAL；领域主张 DOMAIN；事实/记忆/最新信息 FACT；高风险现实决策 HIGH_RISK。",
    "personaIntensity 控制人格显露强度：CASUAL 通常 low；FACT/HIGH_RISK 通常 medium；DOMAIN 通常 high。",
    "如果用户问最新、今天、现在、近期新闻、新上市或模型知识可能过期的事实，needWebSearch 必须为 true，并给出 webSearchQuery 和 researchPlan。",
    "如果不需要联网，needWebSearch 必须为 false，webSearchQuery、webSearchReason 和 researchPlan 必须为 null。",
    "数组字段必须输出数组；没有内容时输出 []，不能输出 false、空、无、空字符串。",
    '如果不安排主动消息，proactiveCandidate 必须是 {"shouldSchedule":false,"delaySeconds":null,"topic":null,"reason":null}。',
    "proactiveCandidate 默认必须为不安排。只有用户明确要求稍后提醒/继续，或上下文强烈需要自然补一句时才安排。",
    "用户只是问候、认同、笑、寒暄、结束话题、情绪轻松承接时，不要安排 proactiveCandidate。",
    "不要把内部分析、用户意图判断、planner reason 暴露为用户可见内容。",
    '示例：{"userIntent":"问候","replyMode":"CASUAL","personaIntensity":"low","answerMode":"casual","retrievalHints":{"focusQueries":[],"boostScopes":[]},"needChatMemory":false,"needPersonaKnowledge":false,"needWebSearch":false,"webSearchQuery":null,"webSearchReason":null,"researchPlan":null,"contextUsed":[],"replyGoal":"自然回应","responseOutline":["简短回应"],"shouldSendMultipleMessages":false,"suggestedMessageCount":1,"avoidRepeating":[],"proactiveCandidate":{"shouldSchedule":false,"delaySeconds":null,"topic":null,"reason":null}}',
  ].join("\n");

const buildPlannerUserPrompt = (input: {
  content: string;
  chatId: string;
  personaVersionId: string;
  personaContext: PlannerPersonaContext;
  runtimeContext: PlannerRuntimeContext;
  recentContextPreview: unknown;
}) =>
  [
    `chatId=${input.chatId}`,
    `personaVersionId=${input.personaVersionId}`,
    "[Persona Context]",
    `displayName=${input.personaContext.displayName}`,
    `previewIntro=${input.personaContext.previewIntro ?? "none"}`,
    `profileSummary=${input.personaContext.profileSummary ?? "none"}`,
    "[Runtime Context]",
    `nowIso=${input.runtimeContext.nowIso}`,
    `dateLabel=${input.runtimeContext.dateLabel}`,
    `timezone=${input.runtimeContext.timezone}`,
    `currentYear=${input.runtimeContext.currentYear}`,
    "[Current User Message]",
    input.content,
    "[Initial Context Preview]",
    JSON.stringify(input.recentContextPreview),
  ].join("\n\n");

const isParseErrorLike = (value: unknown): value is {
  name?: string;
  rawResponse?: unknown;
  parsedCandidate?: unknown;
  normalizedCandidate?: unknown;
  message?: string;
} =>
  value instanceof MiniMaxPlannerParseError ||
  value instanceof FastPlannerParseError ||
  (Boolean(value) &&
    typeof value === "object" &&
    ["MiniMaxPlannerParseError", "FastPlannerParseError"].includes((value as { name?: string }).name ?? ""));

const buildPlannerFailureArtifacts = (input: {
  error: unknown;
}) => {
  if (!isParseErrorLike(input.error)) {
    return [];
  }

  return [
    {
      artifactKey: "planner_raw_response",
      kind: "json" as const,
      value: input.error.rawResponse,
    },
    {
      artifactKey: "planner_parse_error",
      kind: "json" as const,
      value: {
        message: input.error.message ?? "planner parse failed",
        parsedCandidate: input.error.parsedCandidate,
      },
    },
    {
      artifactKey: "planner_normalized_candidate",
      kind: "json" as const,
      value: input.error.normalizedCandidate,
    },
  ];
};

export const runChatPlanner = async (input: {
  chatId: string;
  personaId: string | null;
  personaVersionId: string;
  personaContext?: PlannerPersonaContext;
  runtimeContext?: PlannerRuntimeContext;
  content: string;
  latestMessageId: string | null;
  latestTurnIndex: number | null;
  turnTraceId: string;
  fallbackReplyMode?: PlannerReplyMode;
  fallbackPersonaIntensity?: PlannerPersonaIntensity;
  trace?: PlannerTraceSink;
}) => {
  if (!isChatPlannerEnabled()) {
    input.trace?.({
      eventName: "chat.planner.decision.skipped",
      stage: "planner",
      status: "skipped",
      fields: {
        reason: "disabled",
      },
    });
    return null;
  }

  const plannerGate = shouldRunChatPlannerForTurn(input.content);
  const startedAt = Date.now();
  const provider = readPlannerProvider();
  const model = readPlannerModel(provider);
  input.trace?.({
    eventName: "chat.planner.decision.started",
    stage: "planner",
    status: "started",
    fields: {
      provider,
      model,
      gateReason: plannerGate.reason,
    },
  });

  try {
    const recentContextPreview = {
      recentTurns: await listRecentChatMessages({
        chatId: input.chatId,
        limit: 4,
        excludeMessageIds: input.latestMessageId ? [input.latestMessageId] : [],
        roles: ["USER", "ASSISTANT"],
      }),
    };
    const runtimeContext = input.runtimeContext ?? buildPlannerRuntimeContext();
    const plannerDecisionInput = {
      content: input.content,
      chatId: input.chatId,
      personaVersionId: input.personaVersionId,
      personaContext: input.personaContext ?? {
        displayName: "当前蒸馏对象",
        previewIntro: null,
        profileSummary: null,
      },
      runtimeContext,
      recentContextPreview,
    };
    const abortController = new AbortController();
    const result = await withTimeout(
      provider === "minimax"
        ? runMiniMaxPlannerDecision({
            apiKey: readPlannerApiKey(provider),
            baseUrl: readPlannerBaseUrl(provider),
            model,
            systemPrompt: buildPlannerSystemPrompt(),
            userPrompt: buildPlannerUserPrompt(plannerDecisionInput),
            signal: abortController.signal,
          })
        : runFastPlannerDecision({
            provider,
            apiKey: readPlannerApiKey(provider),
            baseUrl: readPlannerBaseUrl(provider),
            model,
            systemPrompt: buildFastPlannerSystemPrompt(),
            userPrompt: buildPlannerUserPrompt(plannerDecisionInput),
            signal: abortController.signal,
          }),
      readPlannerTimeoutMs(),
      `${provider} planner decision timed out`,
      () => abortController.abort(),
    );

    const hardGuardResult = applyHardGuardOverrides({
      content: input.content,
      plan: chatTurnPlanSchema.parse(result.plan),
    });
    const plan = hardGuardResult.plan;
    input.trace?.({
      eventName: "chat.planner.decision.completed",
      stage: "planner",
      status: "completed",
      durationMs: Date.now() - startedAt,
      fields: {
        provider,
        model,
        hardGuardApplied: hardGuardResult.applied,
        replyMode: plan.replyMode,
        personaIntensity: plan.personaIntensity,
        needChatMemory: plan.needChatMemory,
        needPersonaKnowledge: plan.needPersonaKnowledge,
        needWebSearch: plan.needWebSearch,
        webSearchQuery: plan.webSearchQuery,
        researchSubject: plan.researchPlan?.subject ?? null,
        researchQueries: plan.researchPlan?.searchQueries ?? [],
        researchTimeWindow: plan.researchPlan?.timeWindow ?? null,
        researchAsOf: plan.researchPlan?.asOf ?? null,
        shouldSendMultipleMessages: plan.shouldSendMultipleMessages,
        suggestedMessageCount: plan.suggestedMessageCount,
        proactiveShouldSchedule: plan.proactiveCandidate.shouldSchedule,
      },
      artifacts: [
        {
          artifactKey: "planner_decision_input",
          kind: "json",
          value: plannerDecisionInput,
        },
        {
          artifactKey: "planner_decision_normalized",
          kind: "json",
          value: plan,
        },
        {
          artifactKey: "planner_decision_raw_response",
          kind: "json",
          value: result.rawResponse,
        },
      ],
    });
    return plan;
  } catch (error) {
    const fallbackPlan = buildFallbackChatTurnPlan({
      content: input.content,
      fallbackReplyMode: input.fallbackReplyMode ?? "CASUAL",
      fallbackPersonaIntensity: input.fallbackPersonaIntensity ?? "low",
    });
    input.trace?.({
      eventName: "chat.planner.decision.failed",
      stage: "planner",
      status: "failed",
      level:
        error instanceof MiniMaxPlannerNotConfiguredError || error instanceof FastPlannerNotConfiguredError
          ? "warn"
          : "error",
      durationMs: Date.now() - startedAt,
      fields: {
        provider,
        model,
        errorMessage: error instanceof Error ? error.message : "unknown error",
      },
      artifacts: buildPlannerFailureArtifacts({ error }),
    });
    if (shouldUseFallbackDecision(fallbackPlan)) {
      input.trace?.({
        eventName: "chat.planner.decision.fallback_used",
        stage: "planner",
        status: "completed",
        level: "warn",
        fields: {
          reason: fallbackPlan.needWebSearch ? "fresh_info_fallback" : "proactive_fallback",
          replyMode: fallbackPlan.replyMode,
          personaIntensity: fallbackPlan.personaIntensity,
          needChatMemory: fallbackPlan.needChatMemory,
          needPersonaKnowledge: fallbackPlan.needPersonaKnowledge,
          needWebSearch: fallbackPlan.needWebSearch,
          webSearchQuery: fallbackPlan.webSearchQuery,
          researchSubject: fallbackPlan.researchPlan?.subject ?? null,
          researchQueries: fallbackPlan.researchPlan?.searchQueries ?? [],
        },
        artifacts: [
          {
            artifactKey: "planner_decision_normalized",
            kind: "json",
            value: fallbackPlan,
          },
        ],
      });
      return fallbackPlan;
    }
    return null;
  }
};

export type { ChatTurnPlan };

export const __internal = {
  buildPlannerSystemPrompt,
  buildPlannerFailureArtifacts,
  buildFallbackChatTurnPlan,
  applyHardGuardOverrides,
  buildPlannerRuntimeContext,
  readPlannerProvider,
};
