import { randomUUID } from "node:crypto";

import { chatTraceDetailResponseSchema } from "@hall-of-fame/contracts";

import { normalizeTraceSummary, type OnlineChatEvalMetadata } from "./core.js";

type FastifyApp = Awaited<ReturnType<typeof import("../../app.js")["buildApiApp"]>>;
type SqlResetter = typeof import("../../db/client.js")["resetSqlForTests"];

const INTERNAL_DEBUG_TOKEN = "promptfoo-eval-token";
const TRACE_POLL_ATTEMPTS = 30;
const TRACE_POLL_INTERVAL_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const setEvalEnv = () => {
  process.env.RUN_DB_BOOTSTRAP_ON_STARTUP = "false";
  process.env.CHAT_REALTIME_ENABLED = "false";
  process.env.CHAT_PLANNER_ENABLED = "true";
  process.env.CHAT_PLANNER_MODE = "decision";
  process.env.CHAT_TRACE_INTERNAL_ENABLED = "true";
  process.env.CHAT_TRACE_INTERNAL_TOKEN = INTERNAL_DEBUG_TOKEN;
  process.env.KIMI_WEB_SEARCH_ENABLED = "false";
  process.env.CHAT_VECTOR_RETRIEVAL_ENABLED = "false";
  process.env.PERSONA_VECTOR_RETRIEVAL_ENABLED = "false";
  process.env.CHAT_FAST_PLANNER_API_KEY = "";
  process.env.DEEPSEEK_API_KEY = "";
};

const parseJsonBody = (response: { json: () => unknown }) => {
  try {
    return response.json();
  } catch {
    return null;
  }
};

const readReplyText = (input: {
  replyStatusCode: number;
  replyBody: unknown;
  traceSummaryAnswer: string | null;
}) => {
  const replyBody = input.replyBody as { content?: unknown; message?: { content?: unknown } } | null;

  if (input.replyStatusCode === 200 && typeof replyBody?.content === "string") {
    return replyBody.content;
  }
  if (typeof input.traceSummaryAnswer === "string" && input.traceSummaryAnswer.length > 0) {
    return input.traceSummaryAnswer;
  }
  if (typeof replyBody?.message?.content === "string") {
    return replyBody.message.content;
  }

  return "";
};

export const createOnlineChatEvalProvider = () => {
  let appPromise: Promise<FastifyApp> | null = null;
  let resetSqlForTests: SqlResetter | null = null;

  const ensureApp = async () => {
    if (!appPromise) {
      setEvalEnv();
      appPromise = (async () => {
        const [{ buildApiApp }, dbClient] = await Promise.all([import("../../app.js"), import("../../db/client.js")]);
        resetSqlForTests = dbClient.resetSqlForTests;
        const app = buildApiApp();
        app.log.level = "fatal";
        return app;
      })();
    }

    return appPromise;
  };

  const pollTrace = async (app: FastifyApp, turnTraceId: string) => {
    for (let attempt = 0; attempt < TRACE_POLL_ATTEMPTS; attempt += 1) {
      const traceResponse = await app.inject({
        method: "GET",
        url: `/internal/debug/chat-traces/${turnTraceId}`,
        headers: {
          "x-internal-debug-key": INTERNAL_DEBUG_TOKEN,
        },
      });

      if (traceResponse.statusCode === 200) {
        const parsed = chatTraceDetailResponseSchema.safeParse(parseJsonBody(traceResponse));
        if (parsed.success && parsed.data.trace.status !== "running") {
          return parsed.data;
        }
      }

      await sleep(TRACE_POLL_INTERVAL_MS);
    }

    throw new Error(`timed out waiting for chat trace ${turnTraceId}`);
  };

  return {
    id: () => "online-chat-agent-local-smoke",
    label: "online-chat-agent-local-smoke",
    async callApi(prompt: string, context?: { vars?: Record<string, unknown> }) {
      try {
        const app = await ensureApp();
        const personaId = String(context?.vars?.personaId ?? "");
        const caseId = String(context?.vars?.caseId ?? "unknown-case");
        const bucket = String(context?.vars?.bucket ?? "baseline") as OnlineChatEvalMetadata["bucket"];
        const expectationsJson = String(context?.vars?.expectationsJson ?? "{}");

        const anonymous = await app.inject({
          method: "POST",
          url: "/v1/auth/anonymous",
          payload: {
            deviceId: `promptfoo-eval-${randomUUID()}`,
          },
        });
        const accessToken = (parseJsonBody(anonymous) as { accessToken?: unknown } | null)?.accessToken;
        if (anonymous.statusCode !== 200 || typeof accessToken !== "string") {
          return {
            output: "",
            metadata: {
              caseId,
              bucket,
              providerError: "anonymous auth failed",
            },
          };
        }

        const chat = await app.inject({
          method: "POST",
          url: "/v1/chats",
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            targetType: "published_persona",
            personaId,
          },
        });
        const chatBody = parseJsonBody(chat) as { id?: unknown } | null;
        const chatId = typeof chatBody?.id === "string" ? chatBody.id : "";
        if (chat.statusCode !== 200 || !chatId) {
          return {
            output: "",
            metadata: {
              caseId,
              bucket,
              providerError: "chat creation failed",
            },
          };
        }

        const reply = await app.inject({
          method: "POST",
          url: `/v1/chats/${chatId}/messages`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            content: prompt,
          },
        });
        const replyBody = parseJsonBody(reply) as { turnTraceId?: unknown } | null;
        const turnTraceIdHeader = reply.headers["x-turn-trace-id"];
        const turnTraceId =
          (typeof turnTraceIdHeader === "string" ? turnTraceIdHeader : null) ??
          (typeof replyBody?.turnTraceId === "string" ? replyBody.turnTraceId : null);
        if (!turnTraceId) {
          return {
            output: "",
            metadata: {
              caseId,
              bucket,
              providerError: "turnTraceId missing from reply",
            },
          };
        }

        const traceDetail = await pollTrace(app, turnTraceId);
        const traceSummary = normalizeTraceSummary(traceDetail);
        const output = readReplyText({
          replyStatusCode: reply.statusCode,
          replyBody,
          traceSummaryAnswer: traceSummary.finalAssistantContent,
        });

        return {
          output,
          metadata: {
            caseId,
            bucket,
            personaId,
            prompt,
            chatId,
            turnTraceId,
            replyStatusCode: reply.statusCode,
            expectations: JSON.parse(expectationsJson),
            traceSummary,
          } satisfies OnlineChatEvalMetadata,
        };
      } catch (error) {
        return {
          output: "",
          metadata: {
            providerError: error instanceof Error ? error.message : "unknown provider error",
          },
        };
      }
    },
    async cleanup() {
      if (appPromise) {
        const app = await appPromise;
        await app.close();
      }
      if (resetSqlForTests) {
        await resetSqlForTests();
      }
    },
  };
};
