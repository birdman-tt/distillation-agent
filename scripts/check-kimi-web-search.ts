import { loadLocalEnv } from "@hall-of-fame/runtime-env";

const readPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const main = async () => {
  await loadLocalEnv();

  const args = process.argv.slice(2).filter((item) => item !== "--");
  const query = args.join(" ").trim() || "纪晓岚 公开资料 访谈 作品";
  const apiKey = process.env.ANYSEARCH_API_KEY ?? "";
  const timeoutMs = readPositiveInteger(process.env.ANYSEARCH_TIMEOUT_MS, 30_000);

  console.log("[anysearch] config");
  console.log(`query=${query}`);
  console.log(`apiKeyConfigured=${apiKey.trim() ? "true" : "false"}`);
  console.log(`timeoutMs=${timeoutMs}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.anysearch.com/v1/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        query,
        max_results: 5,
        language: "zh-CN",
        zone: "cn",
      }),
      signal: controller.signal,
    });

    const elapsedMs = Date.now() - (controller as unknown as { __startedAt: number }).__startedAt;
    const payload = await response.json() as {
      code: number;
      message: string;
      data: {
        results: Array<{ title: string; url: string; snippet: string; content: string }>;
        metadata: { request_id: string; total_results: number; search_time_ms: number };
      };
    };

    console.log(`[anysearch] response status=${response.status} elapsed=${elapsedMs}ms`);

    if (!response.ok) {
      console.error(`[anysearch] upstream_error status=${response.status}`);
      process.exit(1);
    }

    if (payload.code !== 0) {
      console.error(`[anysearch] error=${payload.message}`);
      process.exit(1);
    }

    console.log("[anysearch] success");
    console.log(`total_results=${payload.data.metadata.total_results}`);
    console.log(`search_time_ms=${payload.data.metadata.search_time_ms}`);
    for (const [index, source] of payload.data.results.entries()) {
      console.log(`${index + 1}. ${source.title} ${source.url}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[anysearch] failed error=${message}`);
    process.exit(1);
  } finally {
    clearTimeout(timeout);
  }
};

void main();
