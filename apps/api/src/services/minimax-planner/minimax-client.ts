import { chatTurnPlanSchema } from "@hall-of-fame/contracts";
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

export const normalizeChatTurnPlanCandidate = (candidate: unknown) => {
  if (!isPlainRecord(candidate)) {
    return candidate;
  }

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

  return {
    ...candidate,
    userIntent: typeof candidate.userIntent === "string" ? candidate.userIntent : String(candidate.userIntent ?? ""),
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
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    signal: input.signal,
    body: JSON.stringify({
      model: input.model,
      reasoning_split: true,
      messages: input.messages,
      tools: input.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      tool_choice: "auto",
    }),
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
