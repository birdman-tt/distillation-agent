# Hall of Fame Design System

Version: 0.1
Status: Drafted for implementation
Primary references: Claude design language for warmth and editorial tone; Notion design language for restraint, structure, and functional clarity.

## 1. Product Intent

Hall of Fame is not a dashboard and not a generic AI utility.
It should feel like entering a living collection of people you can talk to.

The product promise is:

- you are meeting a persona, not querying a database
- the interface should support intimacy and thoughtfulness, not speed-run productivity
- the primary emotional tone is warm, composed, and literate
- the UI must make chat feel like the center of gravity, with all other flows orbiting around it

This system is mobile-first and chat-first.
If a design decision improves the conversation experience on a phone but weakens desktop density, choose the mobile conversation experience.

## 2. Design Principles

### 2.1 Persona First

The interface must always foreground who the user is talking to before it foregrounds controls, metadata, or system state.

### 2.2 Warm, Not Cute

The product should feel human and refined, but never playful, childish, or mascot-driven.

### 2.3 Editorial, Not Corporate

Typography, spacing, and pacing should feel closer to a well-designed essay or printed profile than to a SaaS console.

### 2.4 Calm Utility

Functional surfaces like creation, review, and preview pages may be simpler and more operational, but they must still inherit the same warm material language.

### 2.5 Hidden Machinery

System logic, inference jargon, and internal decisioning should stay behind the curtain unless the user explicitly asks to inspect them.

### 2.6 Mobile Thumb Priority

Primary actions, send controls, suggested prompts, and navigation must sit in comfortable thumb zones on a typical phone viewport around 390px wide.

## 3. Platform Priority

This design system targets:

1. Mobile web and WeChat Mini Program first
2. Narrow desktop second
3. Wide desktop last

Default design viewport:

- width: 390px
- safe horizontal padding: 16px
- section rhythm: 16 / 24 / 32px scale
- content stack: single-column by default

Desktop should expand gracefully, but must not redefine the experience into a multi-panel enterprise layout.

## 4. Product Feel

The desired atmosphere is:

- thoughtful
- intimate
- composed
- warm
- tactile
- a little literary

The product must not feel:

- gamified
- futuristic
- neon
- dashboard-heavy
- aggressively minimalist
- productivity-bro

If a page can be described as "looks like admin software", it is wrong.

## 5. Visual Language

### 5.1 Material Direction

The base world is warm paper, soft ink, and quiet borders.
Depth comes from layering, tonal shifts, and restraint, not from glossy gradients or hard shadows.

Preferred material cues:

- paper-like warm backgrounds
- soft cream cards
- near-black ink text
- terracotta or clay-like warm accents
- whisper borders
- shallow, warm shadows

Avoid:

- cold blue-gray canvases
- purple-led AI aesthetics
- glassmorphism
- oversized glowing effects
- hard black-and-white contrast blocks except where deliberately needed

### 5.2 Color System

Core palette:

- Canvas: `#f6f0e7`
- Elevated canvas: `#fffdf8`
- Soft alternate surface: `#f2eadf`
- Primary ink: `#1f1a14`
- Secondary ink: `#6b5c4b`
- Hairline border: `#d8c8b2`
- Emphasis border: `#cbb494`
- Brand terracotta: `#9b5c2e`
- Brand terracotta deep: `#7a4621`
- Accent wash: `#efe1cf`
- Success: `#296748`
- Warning: `#a15d1a`
- Danger: `#9c2f2f`

Interactive blue is allowed only for accessible focus states.
It is not a brand color.

### 5.3 Contrast Rules

- Long-form reading surfaces should never be pure black on pure white.
- Metadata must remain readable, but it should not visually compete with persona content.
- Destructive and warning colors should be warm and serious, not alarm-siren bright.

## 6. Typography

### 6.1 Tone

Typography must carry the product.
The system should feel like reading a profile, a notebook, or correspondence, not a software table.

### 6.2 Font Roles

- Display and key page titles: expressive serif
- Body copy and functional UI: clean sans
- Code or share slug snippets: mono only where needed

Recommended fallback stack for current implementation:

- Serif: `"Iowan Old Style", "Palatino Linotype", Georgia, serif`
- Sans: `"Inter", "Helvetica Neue", Arial, sans-serif`
- Mono: `"SFMono-Regular", "Menlo", monospace`

### 6.3 Hierarchy

- Hero title: 36-44px, serif, medium weight, tight line height
- Page title: 28-34px, serif
- Card title: 22-24px, serif
- Section title: 18-20px, sans or serif depending on emotional weight
- Body: 16-17px, sans, line-height 1.6
- Bubble text: 16px, line-height 1.65
- Meta: 13-14px, muted
- Badge: 12-13px, medium

### 6.4 Typographic Rules

- Serif is for presence, not everywhere.
- Sans handles forms, controls, labels, and secondary reading.
- Do not use all caps for major headings.
- Suggested prompts should read like invitations, not chips from a component kit.

## 7. Layout Principles

### 7.1 Mobile Stack

Most pages should read as a vertical narrative:

- identity
- prompt to act
- content
- secondary detail

Do not default to two-column layouts on mobile.

### 7.2 Width Discipline

- Main reading column on mobile: full width minus 16px side padding
- Main reading column on desktop: cap around 720-820px for conversation-heavy surfaces
- Card grids may widen on desktop, but chat should remain readable and narrow enough to feel personal

### 7.3 Spacing Rhythm

Use an 8px base with a soft editorial scale:

- 8px micro spacing
- 12px control spacing
- 16px paragraph / control spacing
- 24px section spacing
- 32px page block spacing
- 48px hero or major block separation

## 8. Core Components

### 8.1 Chat Bubble

The chat bubble is the most important component in the system.

User bubble:

- lighter neutral surface
- minimal decoration
- visually subordinate to assistant bubble

Assistant bubble:

- warmer surface
- slightly softer edge
- more breathing room
- should feel authored, not machine printed

Never attach raw system text directly under every reply.
If rationale is available, expose it via a quiet disclosure affordance.

### 8.2 Reply Inspector

This is the "这句话怎么来的" affordance.

Rules:

- hidden by default
- compact summary label
- tone should feel explanatory, not forensic
- no raw model jargon
- no raw internal enums

### 8.3 Persona Card

Used on home, share entry, and persona listing surfaces.

Must include:

- identity marker
- one-line persona introduction
- a small number of suggested conversation hooks

Must not look like a product SKU card.

### 8.4 Suggested Question

Suggested prompts should feel like conversation starters.

Rules:

- sentence case
- comfortable touch target
- visually softer than a primary button
- can look like prompt slips or conversation notes rather than pills from a SaaS component library

### 8.5 Inputs

Inputs should feel calm and tactile.

Rules:

- generous radius
- warm border
- white or near-white fill
- no hard blue default chrome
- focus ring may use accessible blue, but only on focus

### 8.6 Buttons

Primary:

- terracotta fill
- light text
- rounded
- solid but not loud

Secondary:

- warm neutral fill or ghost
- dark text
- visible border

Danger:

- warm red-brown, not bright red

## 9. Page Patterns

### 9.1 Home / Hall

The homepage is not a catalog grid first.
It is an invitation into a curated hall of personalities.

Must communicate:

- this is a place of people, not tools
- each entry is a different voice
- you can enter quickly

The first screen on mobile should privilege:

- title
- short product promise
- one or two featured entries

### 9.2 Persona Detail Page

This page should quickly answer:

- who is this
- what is the tone
- what kinds of questions fit naturally
- how do I start chatting

Chat should appear early.
Do not bury it beneath long metadata.

### 9.3 Share Page

The share page is the fastest path to conversation.

Rules:

- lighter than the full persona page
- less operational detail
- stronger emotional framing
- prompt to start chat should be above the fold

### 9.4 Create Page

Creation should feel like shaping a persona, not filling a ticket.

Rules:

- break tasks into clear stages
- use warm guidance copy
- keep system status visible but low-drama
- preserve a sense of authorship

### 9.5 Preview Page

Preview is where the creator sees whether the persona feels alive.

Rules:

- prioritize preview chat and intro
- show publishing controls as secondary actions
- make the transition from creation to conversation feel natural

### 9.6 Review Page

This is the only page allowed to lean more operational.
Even here, it should still inherit the warm system.

Rules:

- clear queues
- calm borders
- readable status treatment
- no harsh back-office aesthetic

## 10. Motion and Interaction

Motion should be subtle and purposeful.

Allowed:

- gentle fade/slide on page entry
- staggered reveal for suggested questions
- small send-state transitions
- soft details expansion

Avoid:

- springy toy-like motion
- exaggerated scaling
- flashy loading indicators
- decorative animation that interrupts reading

## 11. Content Presentation Rules

### 11.1 System Language

Do not surface internal reasoning terms in the default UI.

Forbidden in default conversation UI:

- inferred
- grounded
- insufficient_evidence
- refusalReason
- basisSummary
- system diagnostic phrasing

Allowed:

- calm, human-facing explanation language
- optional inspection affordance

### 11.2 Chat Tone on Screen

The UI should support answers that feel:

- direct
- thoughtful
- slightly composed
- not robotic

The interface must not visually force every answer to feel like a compliance statement.

## 12. Do / Don't

Do:

- design for the first thumb reach
- let the persona lead the page
- keep chat visually central
- use warm neutrals everywhere
- make detail disclosure optional and quiet
- preserve enough whitespace for reading

Do not:

- make the product look like a moderation console
- center design around cards before conversation
- use multiple saturated accent colors
- expose inference jargon by default
- make every page a grid
- optimize for desktop dashboard density first

## 13. Implementation Mapping

When this system is implemented, priority should be:

1. live H5 shell in `apps/client/src/h5-app.ts`
2. reusable visual tokens in `packages/ui-tokens/src/index.ts`
3. mobile chat surfaces
4. hall, share, create, preview, review surfaces
5. placeholder React/Taro pages afterward

This design system should be treated as the source of truth for future UI work.
If code and `DESIGN.md` diverge, update code to match the design unless there is a deliberate product decision to revise the design.
