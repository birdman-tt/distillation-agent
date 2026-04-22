# Consumer Surface Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved consumer-surface redesign into the live client shell so the product actually reads as `开口 / 创建 / 我的`, with a narrow homepage, a conversation-first chat scene, a light-start create flow, and a real `我的` surface instead of the current placeholder routing.

**Architecture:** Keep the existing backend route surface as stable as possible. The implementation is primarily a client-shell rewrite across the live H5 server-rendered surface in `apps/client/src/h5-app.ts` and the React/Taro page layer in `apps/client/src/pages/*` plus `apps/client/src/features/*`. The only backend contract change allowed in this plan is a minimal create-payload alignment so the light-start form can persist the approved `一句话定位`.

**Tech Stack:** Fastify-rendered H5 in `apps/client/src/h5-app.ts`, React page/features in `apps/client/src/pages/*` and `apps/client/src/features/*`, shared visual tokens in `packages/ui-tokens`, contracts in `packages/contracts`, API helpers in `packages/api-client`, Fastify API in `apps/api`

---

## References

- Design source of truth:
  - [2026-04-22-consumer-surface-redesign-design.md](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/docs/superpowers/specs/2026-04-22-consumer-surface-redesign-design.md)
- Visual overview board:
  - [consumer-surface-overview-v1.html](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.superpowers/brainstorm/72180-1776824568/content/consumer-surface-overview-v1.html)

## Guardrails

- Do not reintroduce four first-level tabs.
- Do not keep `review` in the primary dock.
- Do not turn `开口` back into a dashboard or content feed.
- Do not treat `/share/demo` as the permanent `我的` page.
- Do not add broad backend redesign work to satisfy this UI plan.
- Preserve the existing chat failure-retry behavior that was already fixed.

## File Map

**Modify:**
- `packages/ui-tokens/src/index.ts`
  - Replace the current private-chat token set with the approved dual-theme consumer surface tokens.
- `packages/ui-tokens/src/index.test.ts`
  - Lock the new light/dark token roles so future UI work does not drift.
- `apps/client/src/h5-app.ts`
  - Main implementation file for the H5 shell, floating dock, homepage, chat scene, create flow, workbench sequence, and new `我的` route.
- `apps/client/src/dev-h5.test.ts`
  - Regression tests for H5 markup and page-structure expectations.
- `apps/client/src/features/chat/chat-panel.tsx`
  - React chat panel must visually and behaviorally match the approved conversation-first shell.
- `apps/client/src/features/creation/create-persona-form.tsx`
  - Replace the current bare form with the approved light-start structure.
- `apps/client/src/pages/home/index.tsx`
  - React home page must become the approved `开口` entry instead of a plain list.
- `apps/client/src/pages/create/index.tsx`
  - Keep this as the create entry, but point it at the new light-start form and success transition.
- `apps/client/src/pages/create/preview.tsx`
  - Reframe this page as the workbench-side preview stage rather than a standalone generic preview screen.
- `packages/contracts/src/personae.ts`
  - Minimal create-payload alignment for `一句话定位`.
- `packages/api-client/src/personae.ts`
  - Keep client helper shape aligned with the contract extension.
- `apps/api/src/routes/personae/manage.ts`
  - Parse and pass the minimal create extension.
- `apps/api/src/store/persona-store.ts`
  - Persist the create extension into the initial draft version.
- `apps/api/src/db/repositories/dynamic-persona-repository.ts`
  - Materialize the initial preview/summary seed for new user-created drafts.

**Create:**
- `apps/client/src/features/profile/profile-dashboard.tsx`
  - New `我的` surface for settings, created objects, drafts, published objects, and secondary review entry.
- `apps/client/src/pages/profile/index.tsx`
  - React/Taro page entry for `我的`.

**Reference only:**
- `apps/client/src/pages/share/index.tsx`
  - Keep share landing semantics separate. Do not overload this page as `我的`.
- `apps/client/src/features/share/share-landing.tsx`
  - Keep the public share landing focused on share consumption, not profile management.
- `apps/client/src/chat-behavior.test.ts`
  - Preserve the already-fixed optimistic clear and retry semantics while restyling chat.

## Task 0: Align The Create Contract With The Light-Start Form

**Purpose:** The approved create entry has three fields: `对象名 / 一句话定位 / 风格标签`. Today the backend only persists `displayName + distillFocus`. Without a tiny contract adjustment, the approved create flow cannot preserve the positioning line through the success page and workbench.

**Files:**
- Modify: `packages/contracts/src/personae.ts`
- Modify: `packages/api-client/src/personae.ts`
- Modify: `apps/api/src/routes/personae/manage.ts`
- Modify: `apps/api/src/store/persona-store.ts`
- Modify: `apps/api/src/db/repositories/dynamic-persona-repository.ts`

- [ ] Extend `createPersonaSchema` with a required `positioning: string` limited to a short single line.
- [ ] Keep `style tags` mapped onto the existing `distillFocus` array instead of creating a second overlapping field.
- [ ] Extend `createPersona(...)` in `packages/api-client` to send `positioning`.
- [ ] Thread `positioning` through the API route and store layer.
- [ ] Persist `positioning` into the initial draft version as both:
  - `preview_intro` seed value
  - `profile_json.summary` seed value
- [ ] Keep this extension minimal. Do not redesign the whole persona/version contract.

**Verification:**
- Run: `pnpm --filter @hall-of-fame/api test`
- Run: `pnpm --filter @hall-of-fame/api typecheck`

## Task 1: Reset Shared Tokens To The Approved Light/Dark Consumer System

**Purpose:** The redesign depends on two linked material systems:

- light mode = chrome-silver + `signal blue`
- dark mode = carbon + `volt green`

The current token system is still tuned for the older private-chat palette, so the rest of the shell will drift unless tokens are reset first.

**Files:**
- Modify: `packages/ui-tokens/src/index.ts`
- Modify: `packages/ui-tokens/src/index.test.ts`

- [ ] Replace the old near-black/plum token naming with role-based tokens that support:
  - light page canvas
  - light elevated surface
  - dark page canvas
  - dark elevated surface
  - `signal blue` primary accent
  - `volt green` primary accent
  - sparse support accent for dark metadata
- [ ] Preserve spacing, radius, and motion tokens unless they conflict with the approved design.
- [ ] Add tests that lock the new token roles and prevent fallback to the old muted palette.
- [ ] Make sure the token names are semantic enough to drive both H5 and React pages.

**Verification:**
- Run: `pnpm --filter @hall-of-fame/ui-tokens test`
- Run: `pnpm --filter @hall-of-fame/ui-tokens typecheck`

## Task 2: Rebuild The Shared H5 Shell Around `开口 / 创建 / 我的`

**Purpose:** The current H5 shell still carries the old primary navigation semantics and keeps `我的` pointed at `/share/demo`. This task converts the shell into the approved 3-tab floating dock.

**Files:**
- Modify: `apps/client/src/h5-app.ts`
- Modify: `apps/client/src/dev-h5.test.ts`

- [ ] Replace the current bottom shuttle items so the primary dock has exactly:
  - `开口`
  - `创建`
  - `我的`
- [ ] Remove `review` from the primary dock.
- [ ] Point the `我的` dock item to a real profile route such as `/profile`, not `/share/demo`.
- [ ] Keep the dock floating, light, and labeled. Do not revert to a heavy embedded tab bar.
- [ ] Add or update shell tests so they fail if:
  - a fourth primary item returns
  - `review` is placed back in the dock
  - `我的` still routes to share-demo

**Verification:**
- Run: `pnpm --filter @hall-of-fame/client test`
- Run: `pnpm --filter @hall-of-fame/client typecheck`

## Task 3: Implement `开口` As A Narrow Swipe-First Homepage

**Purpose:** The homepage is no longer a mixed dashboard. It must become a clean object-selection surface.

**Files:**
- Modify: `apps/client/src/h5-app.ts`
- Modify: `apps/client/src/dev-h5.test.ts`
- Modify: `apps/client/src/pages/home/index.tsx`
- Modify: `apps/client/src/features/hall/use-featured-personae.ts`

- [ ] Rebuild `开口` so it contains only:
  - one short slogan
  - a horizontal swipe / main-card persona carousel
  - one very short intro per object
  - the floating dock
- [ ] Use platform-built-in objects only on this page.
- [ ] Make the active card itself the tap target into chat.
- [ ] Keep adjacent-card peek behavior so the swipe model is visually obvious.
- [ ] Remove homepage modules for:
  - continue chat
  - recommendation paths
  - creator status
  - share management
  - creation shortcuts
- [ ] Update the React home page so it stops rendering a plain text list and follows the same narrow `开口` shape.

**Verification:**
- Run: `pnpm --filter @hall-of-fame/client test`
- Run: `pnpm --filter @hall-of-fame/client typecheck`

## Task 4: Keep Chat Conversation-First While Migrating It Into The New Shell

**Purpose:** Chat already has the correct send/retry behavior. This task keeps that behavior intact while bringing the scene into the new visual and structural system.

**Files:**
- Modify: `apps/client/src/h5-app.ts`
- Modify: `apps/client/src/features/chat/chat-panel.tsx`
- Modify: `apps/client/src/dev-h5.test.ts`
- Reference: `apps/client/src/chat-behavior.test.ts`

- [ ] Restyle the chat scene so it looks like part of the same product family as `开口`.
- [ ] Keep chat free of homepage modules and create controls.
- [ ] Preserve immediate input clear on send.
- [ ] Preserve failure affordance with `↻` retry for user messages.
- [ ] Make sure the H5 and React chat panels both communicate:
  - current conversation partner
  - message flow hierarchy
  - conversation-first composer
- [ ] Do not regress the already-fixed optimistic send timing.

**Verification:**
- Run: `pnpm --filter @hall-of-fame/client test`
- Run: `pnpm --filter @hall-of-fame/client typecheck`

## Task 5: Rebuild `创建` As Light-Start -> Success -> Workbench

**Purpose:** The approved create flow does not start as a full backend editor. It starts light, then deepens.

**Files:**
- Modify: `apps/client/src/features/creation/create-persona-form.tsx`
- Modify: `apps/client/src/pages/create/index.tsx`
- Modify: `apps/client/src/h5-app.ts`
- Modify: `apps/client/src/dev-h5.test.ts`

- [ ] Replace the current create form fields with:
  - `对象名`
  - `一句话定位`
  - `风格标签（预设 + 可自定义）`
- [ ] Map `风格标签` onto `distillFocus`.
- [ ] After submit, show a dedicated success state instead of dropping straight into the workbench.
- [ ] Make the success state carry exactly one primary action: `补资料`.
- [ ] Keep the first create screen visually light and fast, not like a dense settings form.
- [ ] Add test coverage so the create flow fails if it jumps directly from submit to a full workbench.

**Verification:**
- Run: `pnpm --filter @hall-of-fame/client test`
- Run: `pnpm --filter @hall-of-fame/client typecheck`

## Task 6: Reorder The Workbench Around `对象定义 -> 资料管理 -> 预览 -> 发布`

**Purpose:** The workbench needs a real top-to-bottom priority order, not four equal modules fighting for attention.

**Files:**
- Modify: `apps/client/src/h5-app.ts`
- Modify: `apps/client/src/pages/create/preview.tsx`
- Modify: `apps/client/src/dev-h5.test.ts`

- [ ] Rebuild the create workbench so the real visual order is:
  1. `对象定义`
  2. `资料管理`
  3. `预览`
  4. `发布`
- [ ] Give only the current stage the dominant visual emphasis and primary action.
- [ ] Collapse completed stages into lighter summary cards that remain editable.
- [ ] Keep future stages visible for orientation, but not equally loud.
- [ ] In `资料管理`, show both:
  - `添加文本资料`
  - `导入链接`
- [ ] Make `添加文本资料` the default primary action.
- [ ] Keep `预览` clearly before `发布` so the product logic remains conversation-quality-first.
- [ ] Reframe `apps/client/src/pages/create/preview.tsx` or equivalent preview rendering so it reads as the third stage inside the workbench, not as a disconnected generic page.

**Verification:**
- Run: `pnpm --filter @hall-of-fame/client test`
- Run: `pnpm --filter @hall-of-fame/client typecheck`

## Task 7: Build A Real `我的` Surface And Demote Review

**Purpose:** `我的` is now a first-level consumer surface. It cannot remain an alias for share preview, and review cannot stay at the same hierarchy level as core consumer actions.

**Files:**
- Create: `apps/client/src/features/profile/profile-dashboard.tsx`
- Create: `apps/client/src/pages/profile/index.tsx`
- Modify: `apps/client/src/h5-app.ts`
- Modify: `apps/client/src/dev-h5.test.ts`
- Reference: `apps/client/src/pages/share/index.tsx`

- [ ] Create a real `我的` page with sections for:
  - profile / account
  - theme switch
  - my created objects
  - drafts
  - published objects
  - share management
- [ ] Move `review` access into `我的` as a secondary entry instead of a primary dock tab.
- [ ] Keep the public share landing untouched as share consumption UI.
- [ ] Remove the `我的 -> /share/demo` placeholder path from H5.
- [ ] Add tests that fail if `我的` still resolves to share-demo or if review returns to the primary dock.

**Verification:**
- Run: `pnpm --filter @hall-of-fame/client test`
- Run: `pnpm --filter @hall-of-fame/client typecheck`

## Task 8: Bring React/Taro And H5 Back Into Structural Parity

**Purpose:** Right now the H5 shell and the React page layer are drifting. The redesign must not land only in the server-rendered H5 path while the page components remain skeletal placeholders.

**Files:**
- Modify: `apps/client/src/pages/home/index.tsx`
- Modify: `apps/client/src/pages/create/index.tsx`
- Modify: `apps/client/src/pages/create/preview.tsx`
- Modify: `apps/client/src/features/chat/chat-panel.tsx`
- Create: `apps/client/src/pages/profile/index.tsx`
- Create: `apps/client/src/features/profile/profile-dashboard.tsx`

- [ ] Make the React/Taro page tree reflect the same information architecture as H5.
- [ ] Reuse the same semantics and naming:
  - `开口`
  - `创建`
  - `我的`
  - `对象定义 / 资料管理 / 预览 / 发布`
- [ ] Keep share landing separate from profile.
- [ ] Do not leave React pages as plain placeholder lists after H5 has been redesigned.
- [ ] If a route registration file exists or is added later, register `pages/profile/index` there as part of this task.

**Verification:**
- Run: `pnpm --filter @hall-of-fame/client test`
- Run: `pnpm --filter @hall-of-fame/client typecheck`

## Recommended Implementation Order

Implement in this order to reduce churn:

1. Task 0: minimal create contract alignment
2. Task 1: tokens
3. Task 2: shared shell and dock
4. Task 3: homepage
5. Task 4: chat scene
6. Task 5: create light-start
7. Task 6: workbench sequence
8. Task 7: `我的` page and review demotion
9. Task 8: React/Taro parity cleanup

## Final Acceptance Checklist

- [ ] Primary navigation is exactly `开口 / 创建 / 我的`.
- [ ] `开口` is a narrow swipe-first object picker with no dashboard modules.
- [ ] Chat remains conversation-first and preserves retry behavior.
- [ ] `创建` starts light, then transitions through success into the ordered workbench.
- [ ] Workbench order is visibly `对象定义 -> 资料管理 -> 预览 -> 发布`.
- [ ] `我的` is a real management surface, not share-demo.
- [ ] Review is reachable, but not a first-level tab.
- [ ] H5 and React/Taro surfaces no longer contradict each other.
