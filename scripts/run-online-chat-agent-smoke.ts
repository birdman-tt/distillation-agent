import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { evaluate } from "promptfoo";

import {
  assertExpectedReplyMode,
  assertExpectedWebSearchPolicy,
  assertHighRiskBoundary,
  assertNoGenericAiDisclaimer,
  assertReplyIsNonEmpty,
  assertRuntimeDateAnswer,
  assertTraceAvailable,
  assertUncertaintyWhenLatestUnsupported,
} from "../apps/api/src/evals/online-chat-agent/core.js";
import { buildOnlineChatSmokeCases } from "../apps/api/src/evals/online-chat-agent/dataset.js";
import { createOnlineChatEvalProvider } from "../apps/api/src/evals/online-chat-agent/provider.js";

const artifactDir = path.join(process.cwd(), "artifacts", "evals");
const artifactPath = path.join(artifactDir, "online-chat-agent-smoke-latest.json");

const provider = createOnlineChatEvalProvider();
const cases = buildOnlineChatSmokeCases();

const main = async () => {
  const suite = {
    prompts: ["{{prompt}}"],
    providers: [provider],
    tests: cases.map((testCase) => ({
      description: `${testCase.id} | ${testCase.description}`,
      vars: {
        prompt: testCase.prompt,
        caseId: testCase.id,
        bucket: testCase.bucket,
        personaId: testCase.personaId,
        expectationsJson: JSON.stringify(testCase.expectations),
      },
      assert: [
        {
          type: "javascript" as const,
          metric: "reply_nonempty",
          value: (output: string) => assertReplyIsNonEmpty(output),
        },
        {
          type: "javascript" as const,
          metric: "trace_available",
          value: (output: string, context: unknown) => assertTraceAvailable(output, context as Record<string, unknown>),
        },
        {
          type: "javascript" as const,
          metric: "reply_mode",
          value: (output: string, context: unknown) =>
            assertExpectedReplyMode(output, context as Record<string, unknown>),
        },
        {
          type: "javascript" as const,
          metric: "web_search_policy",
          value: (output: string, context: unknown) =>
            assertExpectedWebSearchPolicy(output, context as Record<string, unknown>),
        },
        {
          type: "javascript" as const,
          metric: "safe_uncertainty",
          value: (output: string, context: unknown) =>
            assertUncertaintyWhenLatestUnsupported(output, context as Record<string, unknown>),
        },
        {
          type: "javascript" as const,
          metric: "runtime_date_answer",
          value: (output: string, context: unknown) => assertRuntimeDateAnswer(output, context as Record<string, unknown>),
        },
        {
          type: "javascript" as const,
          metric: "high_risk_boundary",
          value: (output: string, context: unknown) => assertHighRiskBoundary(output, context as Record<string, unknown>),
        },
        {
          type: "javascript" as const,
          metric: "no_generic_ai_disclaimer",
          value: (output: string, context: unknown) =>
            assertNoGenericAiDisclaimer(output, context as Record<string, unknown>),
        },
      ],
    })),
  };

  try {
    console.log("[chat-eval] running online chat smoke suite");
    console.log(`[chat-eval] scenario=search-disabled-smoke cases=${cases.length}`);

    const evalRecord = await evaluate(suite, {
      cache: false,
      maxConcurrency: 1,
      progressBar: false,
    });

    const summary = await evalRecord.toEvaluateSummary();
    await mkdir(artifactDir, { recursive: true });
    await writeFile(artifactPath, JSON.stringify(summary, null, 2));

    const results = Array.isArray((summary as { results?: unknown[] }).results)
      ? ((summary as { results: Array<Record<string, unknown>> }).results ?? [])
      : [];
    const passed =
      typeof (summary as { stats?: { successes?: number } }).stats?.successes === "number"
        ? (summary as { stats: { successes: number } }).stats.successes
        : results.filter((item) => item.success === true).length;
    const total = results.length;
    const failed = total - passed;

    console.log(`[chat-eval] summary: ${passed}/${total} passed`);
    console.log(`[chat-eval] stats: ${JSON.stringify((summary as { stats?: unknown }).stats ?? {})}`);
    console.log(`[chat-eval] artifact: ${artifactPath}`);

    if (failed > 0) {
      console.log("[chat-eval] failing rows:");
      for (const result of results.filter((item) => item.success !== true).slice(0, 10)) {
        const description =
          typeof (result.testCase as { description?: unknown } | undefined)?.description === "string"
            ? ((result.testCase as { description: string }).description ?? "unknown")
            : "unknown";
        const failedComponents = Array.isArray(
          (result.gradingResult as { componentResults?: unknown[] } | undefined)?.componentResults,
        )
          ? ((result.gradingResult as { componentResults: Array<Record<string, unknown>> }).componentResults ?? []).filter(
              (item) => item.pass !== true,
            )
          : [];

        console.log(`- ${description}`);
        if (failedComponents.length === 0) {
          console.log("  no component-level failure reason found");
          continue;
        }
        for (const component of failedComponents) {
          const metric =
            typeof (component.assertion as { metric?: unknown } | undefined)?.metric === "string"
              ? ((component.assertion as { metric: string }).metric ?? "unknown_metric")
              : "unknown_metric";
          const reason = typeof component.reason === "string" ? component.reason : JSON.stringify(component.reason ?? {});
          console.log(`  - ${metric}: ${reason}`);
        }
      }
    }

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await provider.cleanup?.();
  }
};

void main().catch(async (error) => {
  console.error("[chat-eval] runner failed", error);
  try {
    await provider.cleanup?.();
  } catch {}
  process.exitCode = 1;
});
