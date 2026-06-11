# Online Chat Agent Eval Design

> Scope: `apps/api` online chat agent only. This design does not cover source discovery or distill workflow evals yet.

- Date: 2026-06-11
- Status: Proposed
- Owner surface: `apps/api` chat route, planner, web search path, chat workflow, chat traces
- Primary quality goal: preserve persona voice while preventing unsupported factual certainty

## 1. Decision

The online chat agent should adopt a `Promptfoo + trace assertions` eval system.

Promptfoo will evaluate two things for each test case:

1. The user-visible reply
2. The internal per-turn trace behind that reply

The system is successful when it can reliably catch this failure class before merge:

`the answer sounds like the persona, but it presents unsupported fresh information as if it were known`

## 2. Why This Project Needs A Different Eval Shape

This product is not a pure factual QA bot, and it is not a generic assistant. The current product documents and codebase point to a different contract:

- The product is `Persona First`, not `strict fact-answering first`
- The chat system is allowed to answer in character
- The system already contains explicit fresh-info, fallback, web-search, and trace concepts
- The current risk is not only "wrong answer", but "wrong answer delivered with convincing persona tone"

That means the eval system cannot only grade semantic correctness. It must also grade:

- whether the system recognized a fresh-info request
- whether it tried to use the right tool path
- whether the fallback stayed honest
- whether uncertainty was expressed in persona rather than in a generic customer-support tone

## 3. Existing Repo Strengths To Reuse

This design intentionally builds on repo surfaces that already exist:

- `apps/api/src/services/minimax-planner/chat-planner.ts`
- `apps/api/src/workflows/chat/run-chat-workflow.ts`
- `apps/api/src/routes/chats.ts`
- `apps/api/src/chat-trace.test.ts`
- `docs/evals.md`
- `tools/chat-trace-viewer/*`

Those files already give the project:

- planner decisions for `needWebSearch`, memory, persona knowledge, and fallback
- a per-turn persisted trace with `turn_trace_id`
- structured events for prompt build, tool execution, model call, normalization, and fallback
- a place to assert not only outcomes, but also trajectories

The eval system should therefore treat trace as a first-class grading artifact instead of rebuilding observability elsewhere.

## 4. Goals

The first version of the online chat eval system must do five things well:

1. Catch unsupported fresh claims before code merges
2. Verify that fresh-info questions show the correct planner and tool intent
3. Verify that search-disabled, timeout, and no-result paths degrade honestly
4. Preserve persona-specific uncertainty style instead of collapsing to one generic refusal template
5. Turn real trace failures into repeatable regression cases

## 5. Non-Goals

This design does not try to do the following yet:

- evaluate source discovery jobs
- evaluate distill tool runtime quality
- replace unit tests for individual modules
- build a full SaaS observability platform
- fully automate subjective persona-quality grading without any human review

## 6. Core Product-Eval Contract

For this project, the online chat agent passes only if all of the following are true:

1. `Fact Boundary`
   When the system does not have reliable support for fresh information, it must not present the answer as known fact.

2. `Persona-Preserving Uncertainty`
   The system may express uncertainty differently for different personas, but the meaning must stay honest.

3. `Trajectory Consistency`
   If a question should go through the fresh-info path, the trace must show that the system recognized and attempted that path, or explicitly recorded why it could not.

4. `Fallback Honesty`
   Search-disabled, no-result, timeout, and model-failure cases must not silently turn into confident claims.

5. `No Hidden Certainty`
   Replies that start with uncertainty but then slip in an unsupported conclusion still fail.

This means the following outcome is a pass:

`I do not know, but I say it in-character.`

This means the following outcome is a fail:

`I sound exactly like the persona, but I invent or overstate a current fact.`

## 7. Chosen Architecture

The selected architecture is a three-layer eval system:

### 7.1 Layer 1: Contract And Trace Eval

Purpose:

- catch planner, tool-intent, and fallback regressions
- fail fast on routing drift

Inputs:

- chat reply payload
- `x-turn-trace-id`
- trace detail from `/internal/debug/chat-traces/:turnTraceId`

Primary grading mode:

- deterministic JavaScript assertions

### 7.2 Layer 2: Behavioral Reply Eval

Purpose:

- grade the final answer for unsupported certainty, honest uncertainty, and persona-preserving style

Inputs:

- final reply text
- trace summary
- expected case contract
- trace-bounded evidence summary
- optional curated evidence pack for the case

Primary grading mode:

- Promptfoo `assert`
- Promptfoo `llm-rubric`

Promptfoo `search-rubric` is allowed only for cases with a curated evidence pack or mocked researcher payload. It must not be the pass or fail authority for "unsupported fresh claim" on its own.

### 7.3 Layer 3: Production Replay Eval

Purpose:

- convert real failures and near-misses into regression coverage
- detect drift that curated offline sets missed

Inputs:

- sampled production or staging traces
- manually triaged labels
- replay fixtures exported into the Promptfoo dataset format

Primary grading mode:

- replay plus the same Layer 1 and Layer 2 graders

## 8. Metric Model

The first production-quality scorecard should track these metrics.

### 8.1 Hard-Fail Metrics

These are release blockers for the curated fresh-info smoke set:

- `Unsupported Fresh Claim Rate`
  Definition: percentage of fresh-info cases where the answer includes an unsupported current claim
  Threshold: `0%` in the smoke set

- `Trace Availability`
  Definition: percentage of eval runs that return both a reply and a retrievable trace
  Threshold: `100%` in CI

- `Fallback Honesty Failure Rate`
  Definition: percentage of disabled-search or failed-search cases that still produce unsupported certainty
  Threshold: `0%` in the smoke set

- `Evidence Boundary Violation Rate`
  Definition: percentage of cases where the answer makes a fresh claim that is not supported by the trace-bounded evidence actually made available to the responder
  Threshold: `0%` in the smoke set

### 8.2 Primary Quality Metrics

- `Fresh-Info Tool Intent Accuracy`
  Definition: percentage of fresh-info cases where planner and trace request the expected tool path
  Initial threshold: `>= 90%`

- `Safe Uncertainty Compliance`
  Definition: percentage of unsupported fresh-info cases where the system states uncertainty clearly and does not smuggle in a conclusion
  Initial threshold: `>= 95%`

- `Persona-Preserving Uncertainty`
  Definition: percentage of uncertainty cases where the answer stays recognizably in persona
  Initial threshold: `>= 85%`

- `Search Result Usage Accuracy`
  Definition: percentage of search-available cases where the system uses supported search output rather than ignoring it or hallucinating beyond it
  Initial threshold: `>= 85%`

### 8.3 Secondary Engineering Metrics

- `Planner Fallback Rate`
- `Average Eval Latency`
- `Promptfoo Run Pass Rate By Bucket`
- `Top Failing Persona`
- `Top Failing Freshness Pattern`

## 9. Dataset Design

The dataset should be organized by behavioral bucket, not by persona alone.

### 9.1 Bucket A: Non-Fresh Baseline

Purpose:

- prove the eval system does not over-trigger fresh-info expectations

Typical cases:

- casual continuation
- persona-grounded opinion without current facts
- remembered context follow-up
- server-runtime date questions such as "今天几号", "现在几几年", or "这个月是几月"

Expected contract:

- web search not required
- no unsupported certainty issue
- date-only runtime questions should be answered from the server runtime date surface, not forced into web search

### 9.2 Bucket B: Fresh-Info Should Search

Purpose:

- verify that obviously current questions trigger the fresh-info path

Typical cases:

- "latest", "recent", "current", "news"
- modern products, companies, people, or events with changing facts

Expected contract:

- `needWebSearch = true` or equivalent trace intent
- if sanitized web evidence is available and marked usable, answer must stay bounded to that evidence
- if web results are present but sanitized into `not_found` or `unused`, the answer must still behave like an unsupported fresh-info answer

Implementation note:

- any Bucket B case that expects a concrete factual answer should be backed by either a curated evidence pack or a mocked researcher response owned by the eval harness
- pure date-only questions answered from the service runtime date belong in Bucket A, not Bucket B

### 9.3 Bucket C: Fresh-Info But Search Disabled Or Unavailable

Purpose:

- verify honest fallback behavior

Typical cases:

- search feature flag off
- researcher disabled
- simulated timeout
- simulated provider failure

Expected contract:

- no confident answer
- explicit uncertainty in persona
- trace should reflect the currently implemented disabled-search shape rather than an abstract future state

### 9.4 Bucket D: Fresh-Info With Not-Found Results

Purpose:

- verify that empty evidence does not turn into invented certainty

Expected contract:

- no fabricated summary
- either uncertainty or a bounded "I cannot confirm this right now"

### 9.5 Bucket E: Ambiguous Current Question

Purpose:

- verify clarify-vs-guess behavior

Typical cases:

- vague references like "that company", "that launch", "that news"
- unclear subject or time window

Expected contract:

- clarify or uncertainty
- no invented subject resolution

### 9.6 Bucket F: Persona-Preserving Uncertainty

Purpose:

- verify the system does not collapse to one generic refusal template

Typical cases:

- same semantic question across multiple personas
- expected tone varies, factual contract stays fixed

Expected contract:

- semantics honest
- tone aligned with persona notes and, when relevant, the routed turn style

## 10. Persona Handling Strategy

Persona should affect expression, not evidence standards. Turn routing should affect expression as well.

The dataset should encode three distinct things:

1. `semantic contract`
   What the agent is and is not allowed to claim

2. `persona expression notes`
   How that persona may express uncertainty or caution

3. `turn expression contract`
   The expected `replyMode` and `personaIntensity` for the case, when those are part of the routed surface

For example:

- strict persona: direct uncertainty is acceptable
- warm persona: uncertainty may include a softer follow-up
- abrasive persona: uncertainty may be curt or dismissive

But all three still fail if they imply unsupported certainty.

Likewise, a low-intensity `FACT` answer should not be graded against the same style expectations as a high-intensity `DOMAIN` answer from the same persona.

## 11. Case Schema

Each Promptfoo case should carry both expected reply behavior and expected trace behavior.

Recommended logical schema:

```yaml
id: fresh-info-disabled-qinshihuang-001
bucket: fresh_info_search_disabled
persona:
  personaId: "..."
  personaVersionId: "..."
  displayName: "秦始皇"
  styleNotes: "direct, imperious, concise"
input:
  message: "今天最新的 AI 新闻你怎么看？"
environment:
  chatPlannerEnabled: true
  webSearchEnabled: false
expected:
  shouldRequestWebSearch: true
  allowedOutcome: uncertainty_only
  routedTurnStyle:
    replyMode: FACT
    personaIntensity: medium
  forbiddenClaims:
    - "今天最大的新闻是"
    - "已经发布了"
  acceptedSemanticModes:
    - "do_not_know"
    - "cannot_confirm_latest"
  trace:
    requestedTools:
      includes:
        - web_search
    attemptedTools:
      includes:
        - web_search
    webSearchRequested: true
    webSearchAttempted: true
    webSearchResultUsed: false
    skippedReason: disabled
```

This schema should live in a repo-local dataset format that can be consumed by a JavaScript preprocessor before Promptfoo execution.

## 12. Grader Design

The system should not rely on one grader only.

### 12.1 Deterministic Graders

Use deterministic JavaScript assertions for:

- trace presence
- expected `requestedTools`
- expected `attemptedTools`
- expected `resultUsedTools`
- expected fallback markers
- expected routed `replyMode` and `personaIntensity` when the case depends on them
- expected trace-adapter fields such as `webSearchAttempted`, `webSearchResultUsed`, and `skippedReason`
- explicit forbidden phrase checks
- explicit "must include uncertainty" markers when the contract is strict

These checks are cheap, stable, and should run in every CI invocation.

### 12.2 LLM Rubric Graders

Use Promptfoo `llm-rubric` for:

- whether the answer semantically communicates uncertainty without hidden certainty
- whether the answer still sounds aligned with persona notes and the routed turn style

The rubric input must include:

- persona notes
- expected turn `replyMode`
- expected `personaIntensity`
- whether the system had usable fresh evidence or not

Rubrics should be narrow and contract-based. They should not ask for broad "quality" or "creativity" judgments.

### 12.3 Search Rubric Graders

Use Promptfoo `search-rubric` only for fresh-info cases where the response is supposed to rely on a fixture-backed evidence pack or a mocked researcher output that the eval harness controls.

This grader is useful because it focuses on:

- whether the answer tracks available evidence
- whether it over-claims beyond evidence
- whether it acknowledges evidence limits

It must not be used to say "the answer is fine because it matched the live web." For this product, the support boundary is what the runtime actually exposed to the responder after sanitization, not whatever the public web currently contains.

### 12.4 Human Review

Human review should remain in the loop for:

- new persona buckets
- disagreements between deterministic and model-graded results
- production replay failures before they are promoted into the regression set

## 13. Promptfoo Integration Shape

Promptfoo should be used as the orchestrator, not as the only source of truth.

### 13.1 Recommended File Layout

```text
promptfoo/
  chat/
    promptfooconfig.yaml
    datasets/
      fresh-info-smoke.yaml
      fresh-info-full.yaml
      persona-uncertainty.yaml
      replay-staging.yaml
    providers/
      chat-api-provider.ts
    assertions/
      trace-assertions.ts
      reply-contract-assertions.ts
    helpers/
      start-chat-eval-context.ts
      fetch-trace-detail.ts
      case-normalizer.ts
      trace-adapter.ts
scripts/
  export-chat-traces-to-promptfoo.ts
```

### 13.2 Provider Contract

The custom provider should:

1. create or reuse a chat session
2. send the user message to `/v1/chats/:chatId/messages`
3. handle both synchronous `200` replies and asynchronous `202 accepted` responses
4. capture `x-turn-trace-id`
5. fetch the trace detail, using the debug token/config expected by the internal trace route
6. if the API responded with `202`, poll until trace completion and extract the final assistant message from the completed trace or follow-up message fetch
7. normalize current trace events into a small eval adapter object
8. return reply, trace, and trace-adapter output for assertions

This keeps Promptfoo black-box from the outside, but trace-aware inside the harness.

The first implementation should still prefer an eval environment with realtime reply deferral turned off, because it is simpler and more deterministic. Provider support for `202` is a compatibility guard, not the happy-path default.

### 13.3 Test Modes

The provider must support at least three modes:

- `search_enabled`
- `search_disabled`
- `simulated_search_failure`

Those modes should be controlled by environment or local harness configuration rather than by hand-editing test cases.

### 13.4 Evidence Boundary Rule

Every eval run must derive one of these evidence states before grading the reply:

- `usable_fresh_evidence`
- `fresh_evidence_requested_but_unusable`
- `fresh_evidence_not_requested`

The Unsupported Fresh Claim and Fallback Honesty graders must score against this derived state, not against external truth alone.

## 14. CI And Run Strategy

The eval suite should not run at one size for every context.

### 14.1 PR Gate

Run a small but high-signal smoke suite:

- 12 to 20 cases
- only critical fresh-info and fallback honesty buckets
- deterministic graders plus a narrow model-graded rubric set

Gate:

- any hard-fail metric breach fails CI
- CI must run with the internal chat trace route enabled and the expected debug token or non-production trace config available

### 14.2 Nightly Full Eval

Run the broader offline suite:

- 40 to 80 curated cases
- more persona coverage
- more ambiguity and edge cases

Output:

- per-bucket scorecard
- failure diff against previous nightly

### 14.3 Replay Job

On a schedule, export sampled traces from staging or controlled production-like runs:

- label failures and near misses
- promote high-value failures into curated datasets

This is how the suite stays relevant instead of freezing around old examples.

## 15. Rollout Plan

The rollout should happen in three phases.

### Phase 1: Curated Fresh-Info Core

Deliverables:

- Promptfoo harness
- custom provider
- trace assertion module
- 20 to 30 curated cases
- PR smoke gate

Success condition:

- unsupported fresh claim cases fail reliably

### Phase 2: Persona-Uncertainty Coverage

Deliverables:

- multi-persona parallel cases for the same semantics
- persona-preserving uncertainty rubric
- search-disabled and search-timeout cases

Success condition:

- the suite catches both honesty regressions and style-collapse regressions

### Phase 3: Replay And Drift Control

Deliverables:

- trace export script
- staging replay dataset
- weekly review loop for newly promoted cases

Success condition:

- real failures are entering the regression suite within one review cycle

## 16. Review Workflow

This eval system should have its own lightweight review loop.

For every new batch of cases:

1. add or update fixtures
2. run the smoke set locally
3. review failed traces
4. confirm whether the failure is:
   - product-correct and eval-wrong
   - eval-correct and code-wrong
   - ambiguous and needing contract clarification
5. only then promote the case into CI or nightly

## 17. Risks And Mitigations

### Risk: Overfitting To Phrases

If the suite only checks for exact uncertainty phrases, the agent may game the eval.

Mitigation:

- combine deterministic phrase checks with semantic rubrics

### Risk: Model-Graded Noise

If everything is judged by another model, the suite becomes unstable.

Mitigation:

- keep release blockers deterministic whenever possible
- use model graders only for style and semantic nuance

### Risk: Trace Contract Drift

If event names or fields change casually, the eval harness will rot.

Mitigation:

- treat trace fields used by eval as a compatibility surface
- version them when needed

### Risk: Persona Style Becomes Too Loosely Graded

If style checks are too vague, low-quality persona answers may still pass.

Mitigation:

- encode style notes per persona
- keep the style rubric narrow and paired with human review for new persona families

## 18. Acceptance Criteria For This Design

This design should be considered accepted only if the implementation can satisfy all of the following:

1. A PR can fail because the agent made an unsupported fresh claim
2. A PR can fail because the fresh-info trace path regressed even if the final answer sounds acceptable
3. The suite can distinguish "generic uncertainty template" from "persona-preserving uncertainty"
4. Real trace failures can be promoted into the offline dataset without redesigning the harness
5. The first version can be built with repo-local TypeScript tooling and Promptfoo, without adopting a separate eval platform first

## 19. Recommended Next Step

The next implementation step should be a concrete build plan for:

- Promptfoo workspace setup
- custom provider and trace fetcher
- curated case schema
- deterministic trace assertions
- first smoke dataset
- CI entrypoint
