import type { chatResearchPlanSchema } from "@hall-of-fame/contracts";
import type { z } from "zod";

type ResearchPlan = z.infer<typeof chatResearchPlanSchema>;

type WebContext = {
  query: string;
  freshnessStatus: "fresh" | "uncertain" | "not_found";
  keyFindings: string[];
  sources: Array<{
    title: string;
    url: string;
    publishedAt?: string | null;
    snippet?: string | null;
  }>;
  uncertainty: string | null;
};

const safeNotFoundFinding = "未查到可靠来源，不能编造最新事实。";

const countReliableSources = (input: { webContext: WebContext; researchPlan: ResearchPlan | null }) => {
  if (!input.researchPlan?.evidenceRequirement.requireUrl) {
    return input.webContext.sources.length;
  }

  return input.webContext.sources.filter((source) => source.url.trim().length > 0).length;
};

export const sanitizeWebContext = (input: {
  webContext: WebContext;
  researchPlan: ResearchPlan | null;
}): { webContext: WebContext; used: boolean } => {
  const minSources = input.researchPlan?.evidenceRequirement.minSources ?? 1;
  const reliableSourceCount = countReliableSources(input);
  const used = input.webContext.freshnessStatus === "fresh" && reliableSourceCount >= minSources;

  if (used) {
    return {
      webContext: input.webContext,
      used: true,
    };
  }

  return {
    used: false,
    webContext: {
      query: input.researchPlan?.searchQueries[0] ?? input.webContext.query,
      freshnessStatus: "not_found",
      keyFindings: [safeNotFoundFinding],
      sources: [],
      uncertainty: safeNotFoundFinding,
    },
  };
};

export type { WebContext };
