import { loadLocalEnv } from "@hall-of-fame/runtime-env";

import { runKimiResearcher } from "../packages/kimi-client/src/index.js";

const readPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const readKimiApiKey = () => process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY ?? "";
const readKimiBaseUrl = () => process.env.KIMI_BASE_URL ?? process.env.MOONSHOT_BASE_URL ?? "https://api.moonshot.cn/v1";
const readKimiModel = () => process.env.KIMI_MODEL ?? "kimi-k2.6";

const parseJson = (text: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const firstChoice = (payload: Record<string, unknown> | null) => {
  const choices = payload?.choices;
  if (!Array.isArray(choices)) {
    return null;
  }
  const choice = choices[0];
  return choice && typeof choice === "object" && !Array.isArray(choice) ? (choice as Record<string, unknown>) : null;
};

const errorMessage = (payload: Record<string, unknown> | null, fallback: string) => {
  const error = payload?.error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
};

const createTracingFetch = (timeoutMs: number): typeof fetch => {
  let requestCount = 0;

  return async (input, init) => {
    requestCount += 1;
    const requestNumber = requestCount;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      const elapsedMs = Date.now() - startedAt;
      const text = await response.clone().text();
      const payload = parseJson(text);
      const choice = firstChoice(payload);
      const message = choice?.message;
      const toolCalls =
        message && typeof message === "object" && !Array.isArray(message)
          ? ((message as Record<string, unknown>).tool_calls as unknown)
          : null;
      const toolCallCount = Array.isArray(toolCalls) ? toolCalls.length : 0;
      const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : "unknown";

      console.log(
        `[kimi-search] response #${requestNumber} status=${response.status} elapsed=${elapsedMs}ms finish_reason=${finishReason} tool_calls=${toolCallCount}`,
      );

      if (!response.ok) {
        console.error(`[kimi-search] upstream_error=${errorMessage(payload, text.slice(0, 500))}`);
      }

      return response;
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[kimi-search] response #${requestNumber} failed elapsed=${elapsedMs}ms error=${message}`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
};

const main = async () => {
  await loadLocalEnv();

  const args = process.argv.slice(2).filter((item) => item !== "--");
  const query = args.join(" ").trim() || "纪晓岚 公开资料 访谈 作品";
  const apiKey = readKimiApiKey();
  const baseUrl = readKimiBaseUrl();
  const model = readKimiModel();
  const maxToolCalls = readPositiveInteger(process.env.KIMI_MAX_TOOL_CALLS, 3);
  const timeoutMs = readPositiveInteger(process.env.KIMI_SEARCH_CHECK_TIMEOUT_MS, 60_000);

  console.log("[kimi-search] config");
  console.log(`query=${query}`);
  console.log(`baseUrl=${baseUrl}`);
  console.log(`model=${model}`);
  console.log(`apiKeyConfigured=${apiKey.trim() ? "true" : "false"}`);
  console.log(`KIMI_WEB_SEARCH_ENABLED=${process.env.KIMI_WEB_SEARCH_ENABLED ?? "unset"}`);
  console.log(`appKIMI_TIMEOUT_MS=${process.env.KIMI_TIMEOUT_MS ?? "unset"}`);
  console.log(`maxToolCalls=${maxToolCalls}`);
  console.log(`timeoutMs=${timeoutMs}`);

  if (!apiKey.trim()) {
    console.error("[kimi-search] failed: KIMI_API_KEY or MOONSHOT_API_KEY is not configured");
    process.exit(1);
  }

  try {
    const result = await runKimiResearcher(
      {
        userMessage: query,
        webSearchQuery: query,
        plannerReason: "diagnose Kimi web search availability",
        locale: "zh-CN",
        maxFindings: 3,
      },
      {
        apiKey,
        baseUrl,
        model,
        maxToolCalls,
        fetchImpl: createTracingFetch(timeoutMs),
      },
    );

    console.log("[kimi-search] success");
    console.log(`freshnessStatus=${result.freshnessStatus}`);
    console.log(`keyFindings=${result.keyFindings.length}`);
    console.log(`sources=${result.sources.length}`);
    for (const [index, source] of result.sources.entries()) {
      console.log(`${index + 1}. ${source.title} ${source.url}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[kimi-search] failed");
    console.error(`message=${message}`);
    if (/overloaded/iu.test(message)) {
      console.error("diagnosis=Kimi upstream engine is overloaded; web search is not available at this moment.");
    }
    process.exit(1);
  }
};

void main();
