import type { SourceKind } from "./source.js";

export type EvidenceBucket =
  | "WRITINGS"
  | "CONVERSATIONS"
  | "EXPRESSION_DNA"
  | "EXTERNAL_VIEWS"
  | "DECISIONS"
  | "TIMELINE";
export type TrustLevel = "HIGH" | "MEDIUM" | "LOW";
export type SourceCategory =
  | "official_primary"
  | "official_secondary"
  | "canon"
  | "adaptation"
  | "fandom_summary"
  | "analysis"
  | "media_report"
  | "unknown";

export const evidenceBuckets: EvidenceBucket[] = [
  "WRITINGS",
  "CONVERSATIONS",
  "EXPRESSION_DNA",
  "EXTERNAL_VIEWS",
  "DECISIONS",
  "TIMELINE",
];

export type DistillWebSource = {
  title: string;
  url: string;
  publishedAt?: string | null;
  snippet?: string | null;
};

export type DistillSourceCandidateDraft = {
  sourceCandidateId: string;
  bucket: EvidenceBucket;
  title: string;
  url: string;
  normalizedUrlHash: string;
  publisher: string;
  author: null;
  publishedAt: string | null;
  snippet: string;
  sourceKind: SourceKind;
  trustLevel: TrustLevel;
  sourceCategory: SourceCategory;
  isPrimary: boolean;
  recommended: boolean;
  recommendationReason: string;
  dedupeKey: string;
  riskFlags: string[];
};

const getHostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return null;
  }
};

export const createBucketCoverage = (candidates: Array<{ bucket: EvidenceBucket }>) =>
  evidenceBuckets.reduce<Record<EvidenceBucket, number>>((acc, bucket) => {
    acc[bucket] = candidates.filter((candidate) => candidate.bucket === bucket).length;
    return acc;
  }, {} as Record<EvidenceBucket, number>);

export const buildDiscoveryQualityWarnings = (input: {
  existingWarnings?: string[];
  missingBuckets: EvidenceBucket[];
}) => [
  ...(input.existingWarnings ?? []),
  ...(input.missingBuckets.length > 2 ? ["当前资料覆盖偏窄，建议用户补充原始资料。"] : []),
];

export const inferBucketFromSource = (title: string, snippet: string): EvidenceBucket => {
  const text = `${title} ${snippet}`;
  if (/访谈|采访|对谈|问答|演讲|直播/u.test(text)) {
    return "CONVERSATIONS";
  }
  if (/语录|表达|说话|口头禅|风格|文风/u.test(text)) {
    return "EXPRESSION_DNA";
  }
  if (/评价|争议|评论|媒体|外界/u.test(text)) {
    return "EXTERNAL_VIEWS";
  }
  if (/决定|选择|创业|作品|事件|行动/u.test(text)) {
    return "DECISIONS";
  }
  if (/生平|经历|时间线|履历|年表/u.test(text)) {
    return "TIMELINE";
  }
  return "WRITINGS";
};

export const classifySource = (hostname: string, title: string, snippet: string) => {
  const host = hostname.toLowerCase();
  const text = `${title} ${snippet}`;
  const isUserGenerated = /zhihu|douban|bilibili|tieba|weibo|xiaohongshu|reddit|fandom|wiki/u.test(host);
  const looksPrimary = /官网|官方|原文|访谈|采访|演讲|直播|作品|设定集/u.test(text);

  if (looksPrimary && !isUserGenerated) {
    return {
      sourceKind: "PRIMARY" as const,
      trustLevel: "HIGH" as const,
      sourceCategory: "official_primary" as const,
      isPrimary: true,
    };
  }
  if (isUserGenerated) {
    return {
      sourceKind: "SUMMARY" as const,
      trustLevel: "LOW" as const,
      sourceCategory: host.includes("fandom") || host.includes("wiki") ? ("fandom_summary" as const) : ("unknown" as const),
      isPrimary: false,
    };
  }
  return {
    sourceKind: "SECONDARY" as const,
    trustLevel: "MEDIUM" as const,
    sourceCategory: "media_report" as const,
    isPrimary: false,
  };
};

export const detectSourceRiskFlags = (title: string, snippet: string): string[] => {
  const text = `${title} ${snippet}`;
  const flags: string[] = [];
  if (/政治局|总统|主席|战争|恐怖|极端|诈骗|犯罪/u.test(text)) {
    flags.push("risk_sensitive_content");
  }
  if (/未经证实|传闻|网传|爆料/u.test(text)) {
    flags.push("risk_unverified_claim");
  }
  return flags;
};

export const buildSourceCandidatesFromWebContext = (input: {
  normalizedName: string;
  sources: DistillWebSource[];
  createSourceCandidateId: () => string;
  hashValue: (value: string) => string;
  maxCandidates?: number;
}): DistillSourceCandidateDraft[] => {
  const seenUrls = new Set<string>();
  const candidates = input.sources.flatMap((source) => {
    const url = source.url.trim();
    const hostname = getHostname(url);
    if (!hostname || seenUrls.has(url)) {
      return [];
    }
    seenUrls.add(url);

    const title = source.title.trim() || `${input.normalizedName} 公开资料`;
    const snippet = source.snippet?.trim() || `${input.normalizedName} 的公开资料。`;
    const classification = classifySource(hostname, title, snippet);
    const riskFlags = detectSourceRiskFlags(title, snippet);
    const bucket = inferBucketFromSource(title, snippet);

    return [
      {
        sourceCandidateId: input.createSourceCandidateId(),
        bucket,
        title,
        url,
        normalizedUrlHash: input.hashValue(url),
        publisher: hostname,
        author: null,
        publishedAt: source.publishedAt ?? null,
        snippet,
        sourceKind: classification.sourceKind,
        trustLevel: classification.trustLevel,
        sourceCategory: classification.sourceCategory,
        isPrimary: classification.isPrimary,
        recommended: riskFlags.length === 0 && classification.trustLevel !== "LOW",
        recommendationReason:
          riskFlags.length > 0
            ? "搜索结果包含风险信号，默认不选中。"
            : classification.trustLevel === "LOW"
              ? "搜索结果更偏用户整理或摘要，建议只作辅助资料。"
              : "搜索返回的可追溯公开来源。",
        dedupeKey: input.hashValue(url),
        riskFlags,
      },
    ];
  });

  return candidates.slice(0, input.maxCandidates ?? 6);
};
