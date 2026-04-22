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
      normalizedText: [
        `${input.title ?? host} 来源于 ${host}。`,
        `当前 URL 为 ${normalizedUrl}。`,
        "V1 先用受限抓取快照作为资料导入占位文本，后续再接正文提取与可读性解析。",
      ].join(" "),
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
