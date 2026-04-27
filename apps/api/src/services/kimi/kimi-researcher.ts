import { chatResearchPlanSchema } from "@hall-of-fame/contracts";
import { z } from "zod";

const webContextSchema = z.object({
  query: z.string(),
  freshnessStatus: z.enum(["fresh", "uncertain", "not_found"]),
  keyFindings: z.array(z.string()),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      publishedAt: z.string().nullable().optional(),
      snippet: z.string().nullable().optional(),
    }),
  ),
  uncertainty: z.string().nullable(),
});

type WebContext = z.infer<typeof webContextSchema>;
type ResearchPlan = z.infer<typeof chatResearchPlanSchema>;

type KimiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: KimiToolCall[];
    }
  | { role: "tool"; tool_call_id: string; name?: string; content: string };

type KimiToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type KimiResponsePayload = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: KimiToolCall[];
    };
  }>;
  error?: {
    message?: string;
  };
};

export class KimiResearcherNotConfiguredError extends Error {
  constructor() {
    super("Kimi API key is not configured");
  }
}

const defaultBaseUrl = "https://api.moonshot.cn/v1";

const readKimiApiKey = () => process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY ?? "";
const readKimiBaseUrl = () => process.env.KIMI_BASE_URL ?? process.env.MOONSHOT_BASE_URL ?? defaultBaseUrl;
const readKimiModel = () => process.env.KIMI_MODEL ?? "kimi-k2.5";
const readKimiMaxToolCalls = () => {
  const parsed = Number(process.env.KIMI_MAX_TOOL_CALLS ?? "3");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3;
};

const buildSystemPrompt = () =>
  [
    "你是最新信息 Researcher，只负责联网查证并整理上下文，不写最终用户回复。",
    "必要时使用 $web_search；最终只输出合法 JSON object。",
    "如果提供 Research Plan，必须按 searchQueries 查证；subject 是查询主体，normalizedQuestion 是要回答的事实问题。",
    "不要输出“AI助手”“用户指代不明”“你可能指的是”这类 runtime 解释。",
    "输出字段必须且只能包含 query, freshnessStatus, keyFindings, sources, uncertainty。",
    'freshnessStatus 只能是 "fresh"、"uncertain"、"not_found"。',
    "sources 每项包含 title, url, publishedAt, snippet；没有日期就填 null。",
    "不要输出 Markdown，不要输出代码块，不要编造来源。",
  ].join("\n");

const buildUserPrompt = (input: {
  userMessage: string;
  webSearchQuery?: string;
  researchPlan?: ResearchPlan;
  plannerReason: string;
  locale: "zh-CN";
  maxFindings: number;
}) => {
  const query = input.researchPlan?.searchQueries[0] ?? input.webSearchQuery ?? input.userMessage;
  const researchPlanLines = input.researchPlan
    ? [
        "[Research Plan]",
        `subject=${input.researchPlan.subject ?? "unknown"}`,
        `subjectType=${input.researchPlan.subjectType}`,
        `normalizedQuestion=${input.researchPlan.normalizedQuestion}`,
        `freshnessRequirement=${input.researchPlan.freshnessRequirement}`,
        `timeWindow=${input.researchPlan.timeWindow}`,
        `asOf=${input.researchPlan.asOf ?? "unknown"}`,
        `timezone=${input.researchPlan.timezone ?? "unknown"}`,
        `currentYear=${input.researchPlan.currentYear ?? "unknown"}`,
        `ifNoReliableSource=${input.researchPlan.ifNoReliableSource}`,
        "[Search Queries]",
        ...input.researchPlan.searchQueries.map((item, index) => `${index + 1}. ${item}`),
      ]
    : ["[Web Search Query]", query];

  return [
    `locale=${input.locale}`,
    `maxFindings=${input.maxFindings}`,
    `plannerReason=${input.plannerReason}`,
    ...researchPlanLines,
    "[Original User Message]",
    input.userMessage,
  ].join("\n\n");
};

const parseJsonObject = (content: string) => {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/u);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const json = start >= 0 && end >= start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(json) as unknown;
};

const stringifyFinding = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const normalizeWebContextCandidate = (candidate: unknown) => {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return candidate;
  }

  const record = candidate as Record<string, unknown>;
  return {
    ...record,
    keyFindings: Array.isArray(record.keyFindings)
      ? record.keyFindings.map(stringifyFinding).filter(Boolean)
      : [],
    sources: Array.isArray(record.sources)
      ? record.sources.map((source) => {
          if (!source || typeof source !== "object" || Array.isArray(source)) {
            return {
              title: String(source ?? "unknown"),
              url: "",
              publishedAt: null,
              snippet: null,
            };
          }
          const sourceRecord = source as Record<string, unknown>;
          return {
            title: typeof sourceRecord.title === "string" && sourceRecord.title.trim() ? sourceRecord.title : "unknown",
            url: typeof sourceRecord.url === "string" ? sourceRecord.url : "",
            publishedAt: typeof sourceRecord.publishedAt === "string" ? sourceRecord.publishedAt : null,
            snippet: typeof sourceRecord.snippet === "string" ? sourceRecord.snippet : null,
          };
        })
      : [],
    uncertainty: typeof record.uncertainty === "string" ? record.uncertainty : null,
  };
};

const requestKimi = async (input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: KimiMessage[];
  fetchImpl: typeof fetch;
}) => {
  const response = await input.fetchImpl(`${input.baseUrl.replace(/\/$/u, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: 0.6,
      thinking: {
        type: "disabled",
      },
      tools: [
        {
          type: "builtin_function",
          function: {
            name: "$web_search",
          },
        },
      ],
      tool_choice: "auto",
    }),
  });
  const payload = (await response.json()) as KimiResponsePayload;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Kimi request failed with ${response.status}`);
  }

  const message = payload.choices?.[0]?.message;
  if (!message) {
    throw new Error("Kimi returned an empty response");
  }

  return {
    payload,
    message,
  };
};

export const runKimiResearcher = async (
  input: {
    userMessage: string;
    webSearchQuery?: string;
    researchPlan?: ResearchPlan;
    plannerReason: string;
    locale: "zh-CN";
    maxFindings: number;
  },
  deps: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    maxToolCalls?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<WebContext> => {
  const apiKey = deps.apiKey ?? readKimiApiKey();
  if (!apiKey.trim()) {
    throw new KimiResearcherNotConfiguredError();
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const messages: KimiMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(),
    },
    {
      role: "user",
      content: buildUserPrompt(input),
    },
  ];
  const maxToolCalls = deps.maxToolCalls ?? readKimiMaxToolCalls();
  let toolCallCount = 0;

  for (let iteration = 0; iteration <= maxToolCalls; iteration += 1) {
    const response = await requestKimi({
      apiKey,
      baseUrl: deps.baseUrl ?? readKimiBaseUrl(),
      model: deps.model ?? readKimiModel(),
      messages,
      fetchImpl,
    });

    const assistantMessage: KimiMessage = {
      role: "assistant",
      content: response.message.content ?? null,
      tool_calls: response.message.tool_calls,
    };
    messages.push(assistantMessage);

    const toolCalls = response.message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      if (!response.message.content) {
        throw new Error("Kimi returned no WebContext content");
      }
      return webContextSchema.parse(normalizeWebContextCandidate(parseJsonObject(response.message.content)));
    }

    if (toolCallCount + toolCalls.length > maxToolCalls) {
      throw new Error(`Kimi exceeded max tool calls (${maxToolCalls})`);
    }

    for (const toolCall of toolCalls) {
      toolCallCount += 1;
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: toolCall.function.arguments,
      });
    }
  }

  throw new Error(`Kimi exceeded max tool calls (${maxToolCalls})`);
};

export type { WebContext };
