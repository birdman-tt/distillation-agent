import { hashNormalizedUrl, normalizePublicHttpUrl } from "@hall-of-fame/domain";

export const runSourceIngestJob = async (input: {
  url: string;
  title?: string;
  author?: string;
}) => {
  const normalizedUrl = normalizePublicHttpUrl(input.url);
  const host = new URL(normalizedUrl).hostname;

  return {
    normalizedUrl,
    normalizedUrlHash: hashNormalizedUrl(normalizedUrl),
    snapshot: {
      title: input.title ?? host,
      author: input.author ?? null,
      normalizedText: `Fetched placeholder content from ${normalizedUrl}. Replace this with real article extraction when HTTP fetch and readability parsing are enabled.`,
    },
    guardrails: {
      protocol: "http_or_https_only",
      privateNetworkBlocked: true,
      maxRedirects: 2,
      maxResponseBytes: 1_000_000,
      timeoutMs: 8_000,
    },
  };
};
