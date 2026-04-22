# Hall of Fame Design System

Version: 0.2
Status: Approved direction for redesign
Primary references: current virtual companion chat products, refined into a mobile private-chat language for Hall of Fame.

## 1. Product Intent

Hall of Fame should feel like opening a private conversation, not entering a product catalog.

The product promise is:

- you are entering a live chat with a persona, not browsing a tool
- the interface should feel intimate, immediate, and slightly charged
- the primary emotional tone is private nocturne, not editorial warmth
- all non-chat flows should feel like orbiting utilities around the conversation

This system is mobile-first and chat-first.
If a design decision improves the feeling of a private conversation on a phone but weakens desktop density or feature discoverability, choose the conversation feeling.

## 2. Design Principles

### 2.1 Chat Window First

The interface must feel like a messaging app before it feels like a profile, card system, or content browser.

### 2.2 Private, Not Decorative

The product should feel intimate and slightly ambiguous, but never ornamental, cute, or theatrical.

### 2.3 Action Color Must Work

Theme color is not for painting the whole page.
It exists to carry interaction: user bubble, send button, selected state, and current navigation item.

### 2.4 Hidden Machinery

System logic, inference jargon, and internal decisioning should stay behind the curtain unless the user explicitly asks to inspect them.

### 2.5 Bottom-Thumb Priority

Primary actions and navigation must live in the lower reach zone on a typical phone viewport around 390px wide.

### 2.6 One Strong Thing Per Screen

Each primary screen should have one obvious visual center:

- home: the current persona carousel card
- persona page: the message flow
- share page: the conversation entry point

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

- intimate
- private
- slightly ambiguous
- nocturnal
- magnetic
- emotionally restrained

The product must not feel:

- catalog-like
- dashboard-heavy
- line-led
- explainer-heavy
- gamified
- corporate

If a page can be described as "looks like admin software" or "looks like a content card feed", it is wrong.

## 5. Visual Language

### 5.1 Material Direction

The base world is a private chat at night: near-black backdrop, calm surfaces, one active accent, and almost no decorative framing.
Depth comes from layered darkness and clear interaction hierarchy, not from card stacks or border choreography.

Preferred material cues:

- near-black canvases
- darker header bars than the message field
- one clear action color
- assistant surfaces that stay neutral
- user surfaces that carry the product's emotional accent
- soft edge separation, not loud outlines

Avoid:

- making the whole page one tinted color
- border-first design
- multiple competing accents
- bright social-app blue
- decorative gradients as the main identity

### 5.2 Color System

Color should be role-based, not wash-based.

Core palette:

- Canvas: `#0f1115`
- Header / chrome surface: `#14171d`
- Assistant surface: `#1b1f27`
- Alternate neutral surface: `#232833`
- Primary ink: `#f6efe7`
- Secondary ink: `#cabfb6`
- Quiet ink: `#8c909d`
- Hairline border: `#2a303a`
- Emphasis border: `#3a414d`
- User bubble accent: `#8f6376`
- Send / active accent: `#d88aa4`
- Accent press / deep state: `#b46f88`
- Accent wash: `#2f222a`
- Success: `#5f9f85`
- Warning: `#bf8e58`
- Danger: `#bf667d`

Interactive blue is allowed only for accessibility focus states.
It is never a brand color.

### 5.3 Contrast Rules

- Long-form reading surfaces should never be pure black on pure white.
- Main canvases should prefer dark privacy over bright openness.
- Metadata must remain readable, but it should not visually compete with persona content.
- Destructive and warning colors should be warm and serious, not alarm-siren bright.
- Theme color belongs to action and ownership, not to every surface.

## 6. Typography

### 6.1 Tone

Typography should support intimacy, not exposition.
The system should feel closer to a private chat app than to a reading surface or dashboard.

### 6.2 Font Roles

- Display and key page titles: expressive serif
- Body copy and functional UI: clean sans
- Code or share slug snippets: mono only where needed

Recommended fallback stack for current implementation:

- Serif: `"Iowan Old Style", "Palatino Linotype", Georgia, serif`
- Sans: `"Inter", "Helvetica Neue", Arial, sans-serif`
- Mono: `"SFMono-Regular", "Menlo", monospace`

### 6.3 Hierarchy

- Hero title: 32-40px, serif, medium weight, tight line height
- Page title: 24-30px, serif
- Card title: 20-24px, serif
- Section title: 16-18px, sans
- Body: 15-16px, sans, line-height 1.55
- Bubble text: 16px, line-height 1.6
- Meta: 13-14px, muted
- Badge: 12-13px, medium

### 6.4 Typographic Rules

- Serif is for emotional anchors and hero moments, not for every screen label.
- Sans handles messages, controls, labels, and metadata.
- Do not use all caps for major headings.
- Message UI should never feel typographically overloaded.

## 7. Layout Principles

### 7.1 Mobile Stack

Most pages should read as a direct conversation path:

- identity
- conversation
- action
- secondary detail

Do not default to two-column layouts on mobile.

### 7.2 Width Discipline

- Main reading column on mobile: full width minus 16px side padding
- Main reading column on desktop: cap around 720-820px for conversation-heavy surfaces
- Carousel and chat may widen on desktop, but the conversation lane should still feel personal and app-like rather than web-layout wide

### 7.3 Spacing Rhythm

Use an 8px base with a calm mobile-chat scale:

- 8px micro spacing
- 12px control spacing
- 16px paragraph / control spacing
- 24px section spacing
- 32px page block spacing
- 48px hero or major block separation

## 8. Core Components

### 8.1 Chat Bubble

The chat bubble is the primary brand surface of the product.

User bubble:

- carries the emotional theme color
- softer and darker than the send button
- aligned to the right
- readable but clearly owned by the user

Assistant bubble:

- neutral dark surface
- clearly lifted off the background
- aligned to the left
- should feel calm and human, not system-generated

Never attach raw system text directly under every reply.
If rationale is available, expose it via a quiet disclosure affordance.
The default state must look like an ongoing private conversation, not a trace viewer.

### 8.2 Chat Header

The persona page header should behave like a messaging app header.

Rules:

- independent bar from the message field
- only persona name and a very short status line
- no persona summary paragraph
- no metadata chips
- no secondary explanation block

### 8.3 Reply Inspector

This is the "这句话怎么来的" affordance.

Rules:

- hidden by default
- compact summary label
- tone should feel explanatory, not forensic
- no raw model jargon
- no raw internal enums

### 8.4 Persona Card

Used primarily on the home carousel.

Must include:

- name
- one-line hook that creates the urge to enter the conversation
- light identity imagery or atmospheric portrait treatment

Must feel like an emotional entry point, not a SKU card or profile tile.

### 8.5 Bottom Shuttle Navigation

Global navigation should live at the bottom and behave like a shuttle, not a generic tab bar.

Rules:

- horizontally scrollable when needed
- low-profile by default
- current destination clearly active
- shaped like a contained track, not floating pills scattered across the screen
- should feel tactile and thumb-friendly

### 8.6 Slogan Discipline

Each page should try to survive on one line of promise.

Rules:

- hero copy should usually be one sentence
- do not stack explanatory cards near the top of chat-first pages
- if a sentence explains the system instead of deepening the mood, remove it

### 8.7 Inputs

Inputs should feel calm and tactile.

Rules:

- generous radius
- dark field
- quiet neutral edge
- no hard blue default chrome
- focus ring may use accessible blue, but only on focus

### 8.8 Buttons

Primary:

- same family as the user bubble accent
- brighter and more legible than the bubble
- clearly the strongest action surface on the screen

Secondary:

- neutral dark surface
- light text
- quiet border

Danger:

- warm muted red
- serious, not alarm-bright

## 9. Page Patterns

### 9.1 Home / Hall

The homepage is a conversation launcher.
It is not a catalog grid, feature list, or explainer.

Must communicate:

- pick someone
- feel the mood
- enter chat immediately

The first screen on mobile should privilege:

- one strong slogan
- one current persona carousel card
- side peeks of adjacent cards to signal swipe
- direct tap entry into conversation

Rules:

- no long descriptive copy
- no stacked feature cards near the top
- the current card should dominate the screen
- each card should carry name, hook line, and identity imagery with roughly equal emotional weight
- carousel should be hand-driven, never auto-rotating

### 9.2 Persona Detail Page

This page should feel like a messaging app thread.

Rules:

- chat must occupy the visual center immediately
- the first visible message should be from the persona
- no suggested question rail
- no descriptive block between the header and the messages
- composer is fixed and visually primary
- all non-chat context must be either folded away or absent

### 9.3 Share Page

The share page is the fastest path into the same private-chat feeling.

Rules:

- should look like the persona page's lighter sibling
- preserve the header and bubble language
- reduce any operational or provenance text
- entry to chat must sit above the fold

### 9.4 Create Page

Creation should still feel like shaping a conversation partner, not filling a product form.

Rules:

- keep the steps visually restrained
- use short prompts, not explanatory paragraphs
- preserve clear action hierarchy
- avoid turning the page into a management console

### 9.5 Preview Page

Preview is where the creator sees whether the persona feels alive.

Rules:

- prioritize preview chat and intro
- show publishing controls as secondary actions
- make the transition from creation to conversation feel natural

### 9.6 Review Page

This is the only page allowed to lean more operational.
Even here, it should still inherit the same dark-chat system.

Rules:

- clear queues
- restrained panels
- readable status treatment
- no harsh back-office aesthetic

## 10. Motion and Interaction

Motion should be subtle and purposeful.

Allowed:

- gentle fade/slide on page entry
- small send-state transitions
- soft carousel movement
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
- make action color work hard
- use neutral dark surfaces everywhere else
- make detail disclosure optional and quiet
- preserve enough whitespace for reading

Do not:

- make the product look like a moderation console
- let borders do the work of hierarchy
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
