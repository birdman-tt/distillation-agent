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

type AnySearchResult = {
  title: string;
  url: string;
  snippet: string;
  content: string;
};

type AnySearchResponse = {
  code: number;
  message: string;
  data: {
    results: AnySearchResult[];
    metadata: {
      request_id: string;
      total_results: number;
      search_time_ms: number;
    };
  };
};

const defaultAnySearchUrl = "https://api.anysearch.com/v1/search";

const readAnySearchApiKey = () => process.env.ANYSEARCH_API_KEY ?? "";

const buildQuery = (input: {
  userMessage: string;
  webSearchQuery?: string;
  researchPlan?: ResearchPlan;
}) => input.researchPlan?.searchQueries[0] ?? input.webSearchQuery ?? input.userMessage;

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
    signal?: AbortSignal;
  } = {},
): Promise<WebContext> => {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = readAnySearchApiKey();
  const query = buildQuery(input);

  const response = await fetchImpl(defaultAnySearchUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      query,
      max_results: input.maxFindings,
      language: input.locale,
      zone: "cn",
    }),
    signal: deps.signal,
  });

  if (!response.ok) {
    throw new Error(`AnySearch request failed with ${response.status}`);
  }

  const payload = (await response.json()) as AnySearchResponse;

  if (payload.code !== 0) {
    throw new Error(`AnySearch error: ${payload.message}`);
  }

  const results = payload.data?.results ?? [];

  if (results.length === 0) {
    const notFoundFinding = "未查到可靠来源，不能编造最新事实。";
    return {
      query,
      freshnessStatus: "not_found",
      keyFindings: [notFoundFinding],
      sources: [],
      uncertainty: notFoundFinding,
    };
  }

  return webContextSchema.parse({
    query,
    freshnessStatus: "fresh",
    keyFindings: results.map((r) => r.content || r.snippet).filter(Boolean),
    sources: results.map((r) => ({
      title: r.title,
      url: r.url,
      publishedAt: null,
      snippet: r.snippet,
    })),
    uncertainty: null,
  });
};

export type { WebContext };
