# Private Chat H5 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the live H5 shell into a mobile-first private-chat experience with a bottom shuttle nav, single-card home carousel, and a persona page that reads like a real messaging thread.

**Architecture:** Keep the current live H5 entrypoint in `apps/client/src/h5-app.ts`, but change the visual system in three layers: first update `packages/ui-tokens` to carry the new role-based palette and layout rules, then refactor shared shell styles and navigation, then replace the home and persona page markup so they follow the approved `DESIGN.md`. Preserve existing routes and API behavior; this is a presentational rewrite with tighter chat-first semantics.

**Tech Stack:** Fastify-rendered HTML in `apps/client/src/h5-app.ts`, shared design tokens in `packages/ui-tokens`, Node test runner in `apps/client/src/dev-h5.test.ts` and `packages/ui-tokens/src/index.test.ts`

---

## File Map

**Modify:**
- `DESIGN.md`
  - Already updated source of truth for the redesign. Use it to check implementation scope.
- `packages/ui-tokens/src/index.ts`
  - Replace the old plum/editorial token set with the new near-black canvas, neutral assistant surface, and role-based action color system.
- `packages/ui-tokens/src/index.test.ts`
  - Assert the new token roles so future refactors do not drift back to the old palette.
- `apps/client/src/h5-app.ts`
  - Main implementation file for shell CSS, bottom shuttle navigation, home carousel, persona thread view, and the supporting share/create/review surfaces.
- `apps/client/src/dev-h5.test.ts`
  - Regression tests for the generated H5 markup. Update assertions to match the new chat-first structure and remove obsolete copy expectations.

**Reference only:**
- `apps/client/src/chat-presentation.ts`
  - Keep the quiet reply inspector contract unchanged unless the redesign exposes a mismatch.

## Task 1: Reset Design Tokens To A Role-Based Private Chat Palette

**Files:**
- Modify: `packages/ui-tokens/src/index.ts`
- Modify: `packages/ui-tokens/src/index.test.ts`

- [ ] **Step 1: Write the failing token assertions**

Add or replace the token test with assertions for the new role-based palette and layout intent:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { uiTokens } from "./index.js";

test("ui tokens expose role-based private chat colors", () => {
  assert.equal(uiTokens.colors.canvas, "#0f1115");
  assert.equal(uiTokens.colors.chrome, "#14171d");
  assert.equal(uiTokens.colors.assistantSurface, "#1b1f27");
  assert.equal(uiTokens.colors.userBubble, "#8f6376");
  assert.equal(uiTokens.colors.action, "#d88aa4");
});

test("ui tokens keep mobile-first chat layout defaults", () => {
  assert.equal(uiTokens.layout.mobileViewportWidth, 390);
  assert.equal(uiTokens.layout.pagePaddingX, 16);
  assert.ok(uiTokens.layout.shellMaxWidth >= 960);
});
```

- [ ] **Step 2: Run the token test to verify it fails**

Run: `pnpm --filter @hall-of-fame/ui-tokens test`

Expected: FAIL because `chrome`, `assistantSurface`, `userBubble`, and `action` do not exist yet.

- [ ] **Step 3: Implement the token rename and palette reset**

Update `packages/ui-tokens/src/index.ts` so color roles describe how the UI behaves instead of how it used to look:

```ts
export const uiTokens = {
  projectName: "Hall of Fame",
  layout: {
    mobileViewportWidth: 390,
    shellMaxWidth: 1080,
    maxReadableWidth: 760,
    pagePaddingX: 16,
    pagePaddingY: 20,
  },
  colors: {
    canvas: "#0f1115",
    chrome: "#14171d",
    assistantSurface: "#1b1f27",
    neutralSurface: "#232833",
    ink: "#f6efe7",
    inkMuted: "#cabfb6",
    inkSoft: "#8c909d",
    border: "#2a303a",
    borderStrong: "#3a414d",
    userBubble: "#8f6376",
    action: "#d88aa4",
    actionPressed: "#b46f88",
    actionWash: "#2f222a",
    success: "#5f9f85",
    warning: "#bf8e58",
    danger: "#bf667d",
    focusRing: "#7da8ff",
  },
  // keep spacing / radius / typography / motion, but retune values
} as const;
```

- [ ] **Step 4: Run the token tests to verify they pass**

Run: `pnpm --filter @hall-of-fame/ui-tokens test`

Expected: PASS

- [ ] **Step 5: Commit the token reset**

```bash
git add packages/ui-tokens/src/index.ts packages/ui-tokens/src/index.test.ts
git commit -m "feat: reset h5 tokens for private chat"
```

## Task 2: Rebuild The Shared H5 Shell Around A Bottom Shuttle Nav

**Files:**
- Modify: `apps/client/src/h5-app.ts`
- Modify: `apps/client/src/dev-h5.test.ts`

- [ ] **Step 1: Write the failing shell-level tests**

Replace the old shell assertions with tests that enforce the new global shape:

```ts
test("home shell uses a bottom shuttle nav instead of top pills", () => {
  const body = buildFeaturedListBody([
    {
      id: "persona-1",
      displayName: "苏轼",
      previewIntro: "今夜你会先把什么说出口？",
      recommendedQuestions: [],
      originType: "OFFICIAL",
    },
  ]);

  assert.match(body, /bottom-shuttle/);
  assert.match(body, /shuttle-track/);
  assert.doesNotMatch(body, /top-nav|nav-link/);
});

test("home shell keeps only one short slogan above the fold", () => {
  const body = buildFeaturedListBody([
    {
      id: "persona-1",
      displayName: "苏轼",
      previewIntro: "今夜你会先把什么说出口？",
      recommendedQuestions: [],
      originType: "OFFICIAL",
    },
  ]);

  assert.match(body, /只差一句开场/);
  assert.doesNotMatch(body, /产品说明|进入人物馆|进入对话预览/);
});
```

- [ ] **Step 2: Run the H5 test file to verify it fails**

Run: `pnpm --filter @hall-of-fame/client test`

Expected: FAIL because the shell still uses the previous `top-nav` and old copy.

- [ ] **Step 3: Replace the shell chrome and global CSS**

In `apps/client/src/h5-app.ts`, remove the top navigation treatment and rebuild the shell around a bottom shuttle:

```ts
const renderBottomShuttle = (current: "home" | "create" | "review" | "profile") => `
  <nav class="bottom-shuttle" aria-label="主导航">
    <div class="shuttle-track">
      ${[
        { id: "home", label: "聊天", href: "/" },
        { id: "create", label: "创建", href: "/create" },
        { id: "review", label: "审核", href: "/review" },
        { id: "profile", label: "我的", href: "/share" },
      ]
        .map(
          (item) => `
            <a class="shuttle-item ${item.id === current ? "is-active" : ""}" href="${item.href}">
              <span>${item.label}</span>
            </a>
          `,
        )
        .join("")}
    </div>
  </nav>
`;
```

Update the shared CSS block so:

```ts
.shell {
  min-height: 100vh;
  padding: 12px 12px 104px;
}

.bottom-shuttle {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 12px;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.shuttle-track {
  pointer-events: auto;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(20, 23, 29, 0.94);
}

.shuttle-item.is-active {
  background: var(--accent);
  color: #160f14;
}
```

- [ ] **Step 4: Run the H5 tests to verify the new shell passes**

Run: `pnpm --filter @hall-of-fame/client test`

Expected: PASS for the new bottom shuttle and reduced hero copy assertions.

- [ ] **Step 5: Commit the shell rewrite**

```bash
git add apps/client/src/h5-app.ts apps/client/src/dev-h5.test.ts
git commit -m "feat: rebuild h5 shell with bottom shuttle nav"
```

## Task 3: Replace The Home Page With A Single-Card Persona Carousel

**Files:**
- Modify: `apps/client/src/h5-app.ts`
- Modify: `apps/client/src/dev-h5.test.ts`

- [ ] **Step 1: Write the failing home carousel tests**

Add tests that describe the approved homepage behavior:

```ts
test("home page centers one persona carousel card with side peeks", () => {
  const body = buildFeaturedListBody([
    {
      id: "persona-1",
      displayName: "苏轼",
      previewIntro: "今夜你会先把什么说出口？",
      recommendedQuestions: [],
      originType: "OFFICIAL",
    },
  ]);

  assert.match(body, /persona-carousel/);
  assert.match(body, /carousel-viewport/);
  assert.match(body, /carousel-card is-current/);
  assert.doesNotMatch(body, /persona-grid|section-label|hero-copy/);
});
```

- [ ] **Step 2: Run the client tests to verify the carousel test fails**

Run: `pnpm --filter @hall-of-fame/client test`

Expected: FAIL because the current home page still renders the previous hero/card stack.

- [ ] **Step 3: Implement the single-card carousel markup**

Refactor `buildFeaturedListBody()` so the first screen is one dominant card with neighboring peeks:

```ts
const buildHomeCarousel = (personae: FeaturedPersona[]) => `
  <section class="persona-carousel" aria-label="今夜想和谁聊">
    <div class="carousel-viewport">
      ${personae
        .map(
          (persona, index) => `
            <a class="carousel-card ${index === 0 ? "is-current" : ""}" href="/personae/${persona.id}">
              <div class="card-image" aria-hidden="true"></div>
              <div class="card-copy">
                <h2 class="card-name">${escapeHtml(persona.displayName)}</h2>
                <p class="card-hook">${escapeHtml(persona.previewIntro)}</p>
              </div>
            </a>
          `,
        )
        .join("")}
    </div>
  </section>
`;
```

Back it with CSS that makes the center card dominate:

```ts
.carousel-viewport {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(78%, 78%);
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
}

.carousel-card {
  scroll-snap-align: center;
  min-height: 70vh;
}
```

- [ ] **Step 4: Run the client tests and manually inspect the home markup**

Run: `pnpm --filter @hall-of-fame/client test`

Expected: PASS

Also run:

```bash
pnpm --filter @hall-of-fame/client build
```

Expected: PASS

- [ ] **Step 5: Commit the home carousel rewrite**

```bash
git add apps/client/src/h5-app.ts apps/client/src/dev-h5.test.ts
git commit -m "feat: turn home into persona carousel launcher"
```

## Task 4: Recast The Persona Page As A Real Messaging Thread

**Files:**
- Modify: `apps/client/src/h5-app.ts`
- Modify: `apps/client/src/dev-h5.test.ts`

- [ ] **Step 1: Write the failing persona-thread tests**

Replace the old persona-page assertions with thread-specific ones:

```ts
test("persona page behaves like a messaging thread", () => {
  const body = buildPersonaPageBody({
    persona: {
      displayName: "苏轼",
      currentPublishedVersionId: "version-1",
      originType: "OFFICIAL",
    },
    version: {
      previewIntro: "今夜你会先把什么说出口？",
      recommendedQuestions: ["人处在低谷时，怎么和自己相处？"],
      sampleAnswers: ["先安顿自己，再安顿世界。"],
    },
  });

  assert.match(body, /thread-header/);
  assert.match(body, /thread-status/);
  assert.match(body, /message-list/);
  assert.match(body, /composer/);
  assert.doesNotMatch(body, /data-suggested-question=|人物气质|回答样本/);
});
```

- [ ] **Step 2: Run the client tests to verify the persona-thread test fails**

Run: `pnpm --filter @hall-of-fame/client test`

Expected: FAIL because the persona page still includes prompt chips and extra descriptive structure.

- [ ] **Step 3: Rebuild `buildPersonaPageBody()` around a thread layout**

Change the persona page so it renders:

```ts
<header class="thread-header">
  <div>
    <h1 class="thread-name">${escapeHtml(persona.displayName)}</h1>
    <p class="thread-status">在线，等你先开口</p>
  </div>
</header>
<section class="message-list">
  <article class="bubble assistant">
    <p>${escapeHtml(version.previewIntro)}</p>
  </article>
  ${buildSampleUserBubble(version.sampleAnswers)}
</section>
<form class="composer">
  <textarea name="message" placeholder="发一句今晚想说的话"></textarea>
  <button type="submit">发送</button>
</form>
```

Update CSS so the page feels like a DM thread:

```ts
.thread-header {
  position: sticky;
  top: 0;
  background: rgba(20, 23, 29, 0.94);
}

.message-list {
  display: grid;
  gap: 12px;
  padding: 8px 0 112px;
}

.bubble.assistant {
  background: var(--bg-raised);
}

.bubble.user {
  background: linear-gradient(180deg, var(--accent-wash), var(--accent-deep));
}
```

- [ ] **Step 4: Run client tests and build to verify the thread layout passes**

Run:

```bash
pnpm --filter @hall-of-fame/client test
pnpm --filter @hall-of-fame/client build
```

Expected: PASS

- [ ] **Step 5: Commit the persona page rewrite**

```bash
git add apps/client/src/h5-app.ts apps/client/src/dev-h5.test.ts
git commit -m "feat: recast persona page as messaging thread"
```

## Task 5: Align Share, Create, And Review Pages With The New System

**Files:**
- Modify: `apps/client/src/h5-app.ts`
- Modify: `apps/client/src/dev-h5.test.ts`

- [ ] **Step 1: Write the failing supporting-page tests**

Add regression coverage so these pages inherit the new system rather than falling back to the old panel language:

```ts
test("supporting pages inherit the same dark-chat shell", () => {
  const createPage = buildCreatePageBody();
  const reviewPage = buildReviewPageBody();

  assert.match(createPage, /bottom-shuttle/);
  assert.match(createPage, /composer-card|quiet-panel/);
  assert.doesNotMatch(createPage, /hero|top-nav|Step 1/);

  assert.match(reviewPage, /bottom-shuttle/);
  assert.doesNotMatch(reviewPage, /hero|section-label|Source review/);
});
```

- [ ] **Step 2: Run the client tests to verify the supporting-page test fails**

Run: `pnpm --filter @hall-of-fame/client test`

Expected: FAIL because the non-home pages still use the previous shell components and copy.

- [ ] **Step 3: Update the supporting page builders to reuse the new surfaces**

In `apps/client/src/h5-app.ts`, keep the same routes but swap to the new surface vocabulary:

```ts
const renderQuietPanel = (title: string, body: string) => `
  <section class="quiet-panel">
    <h2>${title}</h2>
    ${body}
  </section>
`;
```

Then:

- make create use short prompts and quiet panels
- make share reuse the thread header + bubble language
- make review use restrained queue panels without the old hero framing

- [ ] **Step 4: Run full client verification**

Run:

```bash
pnpm --filter @hall-of-fame/client test
pnpm --filter @hall-of-fame/client typecheck
pnpm --filter @hall-of-fame/client build
```

Expected: PASS

- [ ] **Step 5: Commit the supporting page alignment**

```bash
git add apps/client/src/h5-app.ts apps/client/src/dev-h5.test.ts
git commit -m "feat: align supporting h5 pages with private chat system"
```

## Self-Review

**Spec coverage:**
- `DESIGN.md` says home is a single-card carousel with side peeks: covered by Task 3.
- `DESIGN.md` says persona page is a real chat thread with a bottom composer and no suggested prompts: covered by Task 4.
- `DESIGN.md` says navigation moves to a bottom shuttle: covered by Task 2.
- `DESIGN.md` says theme color is role-based and not page-wide: covered by Task 1 and reinforced in Tasks 2-4.
- `DESIGN.md` says supporting pages should inherit the same dark-chat system without becoming consoles: covered by Task 5.

**Placeholder scan:**
- No `TBD`, `TODO`, or unnamed follow-up steps remain.
- Every task includes exact files, concrete commands, and example target code.

**Type consistency:**
- Token names are consistent across tasks: `chrome`, `assistantSurface`, `userBubble`, `action`.
- Shared shell names are consistent across tasks: `bottom-shuttle`, `shuttle-track`, `thread-header`, `message-list`, `composer`.

