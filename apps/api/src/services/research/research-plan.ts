import { chatResearchPlanSchema } from "@hall-of-fame/contracts";
import type { z } from "zod";

type ResearchPlan = z.infer<typeof chatResearchPlanSchema>;

type PersonaContext = {
  displayName: string;
  previewIntro: string | null;
  profileSummary: string | null;
};

type RuntimeContext = {
  nowIso: string;
  dateLabel: string;
  timezone: string;
  currentYear: number;
};

const secondPersonPattern = /你的|您的|你|您/gu;
const secondPersonTestPattern = /你的|您的|你|您/u;

const uniqueNonEmpty = (values: string[]) => {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
};

const replaceSecondPersonSubject = (value: string, subject: string) => value.replace(secondPersonPattern, subject).trim();

const mentionsSecondPerson = (value: string) => secondPersonTestPattern.test(value);

const isInterviewGuestQuestion = (value: string) => /(访谈|播客|节目).*(嘉宾|请了谁|邀请|谁)|嘉宾/u.test(value);

const buildExecutableSearchQuestion = (input: {
  subject: string | null;
  question: string;
  currentYear: number;
}) => {
  const subject = input.subject?.trim();
  if (subject && isInterviewGuestQuestion(input.question)) {
    return {
      normalizedQuestion: "最近一次访谈节目的嘉宾是谁",
      searchQueries: [`${subject} 最近 访谈 嘉宾 ${input.currentYear}`],
    };
  }

  return null;
};

export const normalizeResearchPlan = (input: {
  needWebSearch: boolean;
  webSearchQuery: string | null;
  researchPlan: ResearchPlan | null;
  personaContext: PersonaContext;
  runtimeContext: RuntimeContext;
  userMessage: string;
}): { researchPlan: ResearchPlan | null; webSearchQuery: string | null } => {
  if (!input.needWebSearch) {
    return {
      researchPlan: null,
      webSearchQuery: input.webSearchQuery,
    };
  }

  const basePlan =
    input.researchPlan ??
    ({
      subject: null,
      subjectType: "unknown",
      normalizedQuestion: input.webSearchQuery?.trim() || input.userMessage.trim(),
      searchQueries: input.webSearchQuery ? [input.webSearchQuery] : [],
      freshnessRequirement: "latest_available",
      timeWindow: "latest_available",
      evidenceRequirement: {
        minSources: 1,
        requireUrl: true,
      },
      ifNoReliableSource: "say_not_found_do_not_guess",
      asOf: null,
      timezone: null,
      currentYear: null,
    } satisfies ResearchPlan);

  const shouldUsePersonaSubject =
    !basePlan.subject?.trim() &&
    (mentionsSecondPerson(input.userMessage) ||
      basePlan.searchQueries.some((query) => mentionsSecondPerson(query)) ||
      mentionsSecondPerson(input.webSearchQuery ?? ""));
  const subject = shouldUsePersonaSubject ? input.personaContext.displayName : basePlan.subject?.trim() || null;
  const subjectType = shouldUsePersonaSubject ? "persona" : basePlan.subjectType;
  const rawNormalizedQuestion = basePlan.normalizedQuestion.trim() || input.webSearchQuery?.trim() || input.userMessage.trim();
  const rewrittenNormalizedQuestion = subject ? replaceSecondPersonSubject(rawNormalizedQuestion, subject) : rawNormalizedQuestion;
  const executableQuestion = buildExecutableSearchQuestion({
    subject,
    question: `${input.userMessage}\n${rewrittenNormalizedQuestion}`,
    currentYear: input.runtimeContext.currentYear,
  });
  const normalizedQuestion = executableQuestion?.normalizedQuestion ?? rewrittenNormalizedQuestion;
  const rawQueries = uniqueNonEmpty([
    ...basePlan.searchQueries,
    ...(input.webSearchQuery ? [input.webSearchQuery] : []),
  ]);
  const rewrittenQueries = uniqueNonEmpty(
    rawQueries.map((query) => (subject ? replaceSecondPersonSubject(query, subject) : query)),
  );
  const fallbackQuery = uniqueNonEmpty([
    [subject ?? input.personaContext.displayName, normalizedQuestion, String(input.runtimeContext.currentYear)].join(" "),
  ])[0]!;
  const searchQueries = (executableQuestion?.searchQueries ?? (rewrittenQueries.length > 0 ? rewrittenQueries : [fallbackQuery])).slice(0, 3);

  const researchPlan = chatResearchPlanSchema.parse({
    ...basePlan,
    subject,
    subjectType,
    normalizedQuestion,
    searchQueries,
    evidenceRequirement: {
      minSources: basePlan.evidenceRequirement.minSources,
      requireUrl: basePlan.evidenceRequirement.requireUrl,
    },
    asOf: input.runtimeContext.nowIso,
    timezone: input.runtimeContext.timezone,
    currentYear: input.runtimeContext.currentYear,
  });

  return {
    researchPlan,
    webSearchQuery: searchQueries[0] ?? input.webSearchQuery,
  };
};

export type { PersonaContext, ResearchPlan, RuntimeContext };
