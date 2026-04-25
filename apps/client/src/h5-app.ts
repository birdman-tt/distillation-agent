import Fastify, { type FastifyReply } from "fastify";
import { uiTokens } from "@hall-of-fame/ui-tokens";

import { buildReplyInspectorHtml } from "./chat-presentation.js";

const apiBaseUrl = () => process.env.PUBLIC_API_BASE_URL ?? process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";

const pageStyles = `
  :root {
    --shell-width: ${uiTokens.layout.shellMaxWidth}px;
    --read-width: ${uiTokens.layout.maxReadableWidth}px;
    --shell-pad-top: 12px;
    --shell-pad-bottom: 108px;
    --radius-panel: ${uiTokens.radius.large};
    --radius-card: ${uiTokens.radius.large};
    --radius-bubble: ${uiTokens.radius.bubble};
    --radius-pill: ${uiTokens.radius.pill};
    --serif: ${uiTokens.typography.display.family};
    --sans: ${uiTokens.typography.body.family};
    --mono: ${uiTokens.typography.mono.family};
    --focus: ${uiTokens.colors.focusRing};
    --success: ${uiTokens.colors.success};
    --warning: ${uiTokens.colors.warning};
    --danger: ${uiTokens.colors.danger};
  }

  html {
    scroll-behavior: smooth;
    --page-bg: ${uiTokens.colors.lightCanvas};
    --page-bg-bottom: ${uiTokens.colors.lightSurfaceStrong};
    --surface: ${uiTokens.colors.lightSurface};
    --surface-strong: ${uiTokens.colors.lightSurfaceStrong};
    --soft-surface: ${uiTokens.colors.lightSoft};
    --field-surface: rgba(255, 255, 255, 0.48);
    --input-bg: rgba(255, 255, 255, 0.78);
    --glass-surface: rgba(255, 255, 255, 0.58);
    --control-surface: rgba(255, 255, 255, 0.72);
    --ink: ${uiTokens.colors.ink};
    --ink-muted: ${uiTokens.colors.inkMuted};
    --ink-soft: ${uiTokens.colors.inkSoft};
    --history-name-ink: #11161c;
    --history-snippet-ink: rgba(17, 22, 28, 0.72);
    --history-time-ink: rgba(17, 22, 28, 0.42);
    --line: ${uiTokens.colors.lineLight};
    --accent: ${uiTokens.colors.signalBlue};
    --accent-deep: ${uiTokens.colors.signalBlueDeep};
    --accent-wash: ${uiTokens.colors.signalBlueWash};
    --accent-ink: #f7fbff;
    --support-accent: ${uiTokens.colors.signalBlue};
    --accent-glow: rgba(56, 112, 255, 0.18);
    --support-glow: rgba(56, 112, 255, 0.08);
    --input-scrollbar-thumb: rgba(56, 112, 255, 0.38);
    --input-scrollbar-thumb-hover: rgba(56, 112, 255, 0.55);
    --peek-surface: linear-gradient(180deg, #f1f4f8, #e7ecf3);
    --portrait-surface:
      radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.45), transparent 4rem),
      linear-gradient(180deg, rgba(56, 112, 255, 0.22), rgba(255, 255, 255, 0.16)),
      linear-gradient(180deg, #eef3fb, #cfd8e6);
    --portrait-line: rgba(255, 255, 255, 0.48);
    --surface-shadow: ${uiTokens.shadow.card};
    --hero-shadow: 0 16px 28px rgba(17, 22, 28, 0.08);
    --button-shadow: ${uiTokens.shadow.card};
    --dot-muted: rgba(17, 22, 28, 0.16);
    --support-dot: #0f141a;
    --active-surface: rgba(255, 255, 255, 0.58);
    --hero-surface:
      radial-gradient(circle at 78% 16%, rgba(56, 112, 255, 0.08), transparent 7rem),
      linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(247, 249, 252, 0.99));
  }

  html[data-theme="dark"] {
    --page-bg: ${uiTokens.colors.darkCanvas};
    --page-bg-bottom: ${uiTokens.colors.darkChrome};
    --surface: ${uiTokens.colors.darkSurface};
    --surface-strong: ${uiTokens.colors.darkSurfaceStrong};
    --soft-surface: rgba(255, 255, 255, 0.08);
    --field-surface: rgba(255, 255, 255, 0.06);
    --input-bg: rgba(255, 255, 255, 0.08);
    --glass-surface: rgba(255, 255, 255, 0.06);
    --control-surface: rgba(255, 255, 255, 0.08);
    --ink: ${uiTokens.colors.inkOnDark};
    --ink-muted: ${uiTokens.colors.inkMutedOnDark};
    --ink-soft: ${uiTokens.colors.inkSoftOnDark};
    --history-name-ink: rgba(244, 247, 250, 0.96);
    --history-snippet-ink: rgba(244, 247, 250, 0.74);
    --history-time-ink: rgba(244, 247, 250, 0.46);
    --line: ${uiTokens.colors.lineDark};
    --accent: ${uiTokens.colors.voltGreen};
    --accent-deep: ${uiTokens.colors.voltGreenDeep};
    --accent-wash: ${uiTokens.colors.voltGreenWash};
    --accent-ink: #18210c;
    --support-accent: ${uiTokens.colors.supportCyan};
    --accent-glow: rgba(177, 255, 59, 0.18);
    --support-glow: rgba(68, 219, 255, 0.1);
    --input-scrollbar-thumb: rgba(177, 255, 59, 0.42);
    --input-scrollbar-thumb-hover: rgba(177, 255, 59, 0.62);
    --peek-surface: ${uiTokens.colors.darkSoft};
    --portrait-surface:
      linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(177, 255, 59, 0.12)),
      rgba(255, 255, 255, 0.05);
    --portrait-line: rgba(255, 255, 255, 0.14);
    --surface-shadow: ${uiTokens.shadow.cardDark};
    --hero-shadow: ${uiTokens.shadow.panelDark};
    --button-shadow: ${uiTokens.shadow.cardDark};
    --dot-muted: rgba(255, 255, 255, 0.18);
    --support-dot: ${uiTokens.colors.supportCyan};
    --active-surface: rgba(255, 255, 255, 0.06);
    --hero-surface:
      radial-gradient(circle at 80% 18%, rgba(177, 255, 59, 0.16), transparent 10rem),
      linear-gradient(180deg, #1b2126, #242d35);
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: var(--sans);
    color: var(--ink);
    background:
      radial-gradient(circle at 84% 10%, var(--accent-glow), transparent 18rem),
      radial-gradient(circle at 12% 88%, var(--support-glow), transparent 18rem),
      linear-gradient(180deg, var(--page-bg), var(--page-bg-bottom));
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  button,
  input,
  textarea,
  select {
    font: inherit;
  }

  button,
  a,
  summary {
    -webkit-tap-highlight-color: transparent;
  }

  [hidden] {
    display: none !important;
  }

  :focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .shell {
    position: relative;
    max-width: var(--shell-width);
    margin: 0 auto;
    min-height: 100vh;
    padding: var(--shell-pad-top) 0 var(--shell-pad-bottom);
  }

  .shell.chat-only {
    --shell-pad-bottom: 20px;
  }

  .page-frame,
  .page-stage,
  .stack,
  .field-stack,
  .list-stack,
  .thread-screen,
  .workbench-shell {
    display: grid;
    gap: 16px;
  }

  .page-stage {
    padding-inline: 12px;
  }

  .top-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .top-copy {
    display: grid;
    gap: 6px;
  }

  .top-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }

  .chat-stage {
    --chat-sticky-offset: 64px;
  }

  .chat-stage > .top-bar {
    position: sticky;
    top: 0;
    z-index: 6;
    align-items: center;
    margin-inline: -12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    background:
      radial-gradient(circle at 92% 0%, var(--accent-glow), transparent 9rem),
      linear-gradient(180deg, var(--page-bg), var(--page-bg-bottom));
    backdrop-filter: blur(16px);
  }

  .chat-stage > .top-bar .page-eyebrow {
    display: none;
  }

  .chat-stage > .top-bar .top-copy {
    gap: 4px;
  }

  .chat-stage > .top-bar .page-title {
    font-size: clamp(1.35rem, 5vw, 1.8rem);
    line-height: 1;
  }

  .chat-stage > .top-bar .page-subtitle {
    font-size: 12px;
    line-height: 1.2;
  }

  .page-eyebrow,
  .field-label,
  .mini-eyebrow,
  .bubble-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  .page-title,
  .section-title,
  .card-title,
  .card-name,
  .thread-name,
  .stat-number {
    margin: 0;
    font-family: var(--serif);
    letter-spacing: -0.03em;
    line-height: 0.95;
  }

  .page-title {
    font-size: clamp(2rem, 7vw, 2.8rem);
  }

  .page-copy-inset {
    padding-inline: 12px;
  }

  .section-title {
    font-size: clamp(1.45rem, 5vw, 2rem);
  }

  .card-title {
    font-size: clamp(1.25rem, 4vw, 1.6rem);
  }

  .card-name {
    max-width: 9ch;
    font-size: clamp(2rem, 7vw, 2.9rem);
  }

  .thread-name {
    font-size: clamp(1.45rem, 5vw, 1.95rem);
  }

  .page-subtitle,
  .body-copy,
  .summary-copy,
  .card-hook,
  .thread-status,
  .meta {
    margin: 0;
    line-height: 1.6;
  }

  .page-subtitle,
  .body-copy,
  .summary-copy,
  .card-hook {
    color: var(--ink-muted);
    font-size: 14px;
  }

  .thread-status,
  .meta {
    color: var(--ink-soft);
    font-size: 13px;
  }

  .thread-status {
    display: inline-flex;
    align-items: center;
    min-height: 18px;
  }

  .typing-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .typing-indicator-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--accent);
    box-shadow: 0 0 14px rgba(184, 255, 43, 0.34);
    animation: typing-dot 1s ease-in-out infinite;
  }

  .icon-button,
  .button-link,
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 11px 16px;
    border-radius: 16px;
    border: 1px solid transparent;
    cursor: pointer;
    transition:
      transform ${uiTokens.motion.sectionRevealMs}ms ease,
      background ${uiTokens.motion.sectionRevealMs}ms ease,
      border-color ${uiTokens.motion.sectionRevealMs}ms ease;
  }

  .icon-button {
    width: 36px;
    min-height: 36px;
    padding: 0;
    border-radius: 999px;
    border-color: var(--line);
    background: var(--control-surface);
    color: var(--ink);
    box-shadow: none;
  }

  .button-link,
  button {
    background: linear-gradient(180deg, var(--accent), var(--accent-deep));
    color: var(--accent-ink);
    box-shadow: var(--button-shadow);
  }

  .button-link.secondary,
  button.secondary,
  .utility-link.secondary {
    background: var(--soft-surface);
    border-color: var(--line);
    color: var(--ink);
    box-shadow: none;
  }

  .button-link.ghost,
  button.ghost {
    background: transparent;
    border-color: var(--line);
    color: var(--ink-muted);
    box-shadow: none;
  }

  button.ok {
    background: linear-gradient(180deg, #34a373, var(--success));
    color: #f6fffa;
  }

  button.danger {
    background: linear-gradient(180deg, #d97188, var(--danger));
    color: #fff7f8;
  }

  button:hover,
  .button-link:hover,
  .utility-link:hover {
    transform: translateY(-1px);
  }

  .mini-link,
  .utility-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 10px 14px;
    border-radius: 16px;
    border: 1px solid var(--line);
    background: var(--soft-surface);
    color: var(--ink);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .persona-carousel {
    width: 100%;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 12px;
    margin-left: calc(50% - 50vw);
    padding: 0 0 44px;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }

  .carousel-viewport {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(84%, 84%);
    align-items: stretch;
    gap: 12px;
    width: 100%;
    height: 80vh;
    overflow-x: auto;
    padding: 14px 2px 50px 22px;
    background: transparent;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: 12px;
    overscroll-behavior-x: contain;
    touch-action: pan-x;
    scrollbar-width: none;
  }

  .carousel-viewport::-webkit-scrollbar {
    display: none;
  }

  .carousel-card {
    position: relative;
    display: grid;
    align-content: end;
    gap: 12px;
    min-height: 0;
    height: 100%;
    padding: 18px;
    border-radius: 36px;
    border: 1px solid var(--line);
    background: var(--hero-surface);
    box-shadow: var(--hero-shadow);
    scroll-snap-align: center;
    overflow: hidden;
    transition:
      transform ${uiTokens.motion.sectionRevealMs}ms ease,
      opacity ${uiTokens.motion.sectionRevealMs}ms ease,
      background ${uiTokens.motion.sectionRevealMs}ms ease,
      box-shadow ${uiTokens.motion.sectionRevealMs}ms ease;
    user-select: none;
  }

  .carousel-card.is-current {
    transform: translateY(0);
    opacity: 1;
  }

  .carousel-card.is-peek {
    background: var(--peek-surface);
    box-shadow: 0 10px 20px rgba(17, 22, 28, 0.04);
    opacity: 0.86;
    transform: translateY(10px) scale(0.972);
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-image {
    position: absolute;
    top: 18px;
    right: 18px;
    display: grid;
    place-items: center;
    width: 120px;
    height: 154px;
    border-radius: 30px;
    border: 1px solid var(--portrait-line);
    background: var(--portrait-surface);
    box-shadow: var(--surface-shadow);
    color: var(--ink);
  }

  .card-monogram {
    font-family: var(--serif);
    font-size: clamp(2.4rem, 9vw, 3.6rem);
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    padding: 6px 12px;
    border-radius: var(--radius-pill);
    background: var(--soft-surface);
    border: 1px solid var(--line);
    color: var(--ink-soft);
    font-size: 12px;
  }

  .hero-dots {
    position: relative;
    top: -50px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 0 0 2px;
  }

  .hero-dot {
    display: inline-flex;
    min-height: 4px;
    padding: 0;
    border: 0;
    appearance: none;
    width: 10px;
    height: 4px;
    border-radius: 999px;
    background: var(--dot-muted);
    box-shadow: none;
    cursor: pointer;
    transition:
      width ${uiTokens.motion.sectionRevealMs}ms ease,
      background ${uiTokens.motion.sectionRevealMs}ms ease,
      opacity ${uiTokens.motion.sectionRevealMs}ms ease;
  }

  .hero-dot.is-active {
    width: 26px;
    background: var(--accent);
  }

  .bottom-shuttle {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 12px;
    z-index: 20;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .shuttle-track {
    pointer-events: auto;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    align-items: center;
    width: min(calc(100vw - 24px), 430px);
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--glass-surface);
    box-shadow: var(--surface-shadow);
    backdrop-filter: blur(12px);
  }

  .shuttle-item {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 40px;
    padding: 0 12px;
    border-radius: 999px;
    color: var(--ink-soft);
    white-space: nowrap;
  }

  .shuttle-item.is-active {
    background: var(--accent);
    color: var(--accent-ink);
    box-shadow: var(--button-shadow);
  }

  .history-stage {
    min-height: calc(100vh - var(--shell-pad-top) - var(--shell-pad-bottom));
    align-content: start;
    gap: 18px;
  }

  .history-section,
  .history-copy {
    display: grid;
    gap: 10px;
  }

  .history-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
  }

  .history-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }

  .history-item {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    align-items: start;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 24px;
    border: 1px solid var(--line);
    background: var(--glass-surface);
    box-shadow: var(--surface-shadow);
    backdrop-filter: blur(12px);
  }

  .history-main {
    min-width: 0;
  }

  .history-avatar {
    width: 44px;
    height: 44px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border: 1px solid var(--portrait-line);
    background: var(--portrait-surface);
    box-shadow: var(--surface-shadow);
    font-family: var(--serif);
    font-size: 24px;
    line-height: 1;
  }

  .history-name {
    margin: 0;
    font-size: clamp(1.15rem, 4vw, 1.4rem);
    font-family: var(--serif);
    color: var(--history-name-ink);
    letter-spacing: -0.03em;
    line-height: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-time {
    color: var(--history-time-ink);
    font-size: 12px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .history-snippet {
    margin: 0;
    color: var(--history-snippet-ink);
    line-height: 1.45;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .shell-panel,
  .summary-card,
  .stage-card,
  .profile-card,
  .thread-header,
  .composer-shell {
    display: grid;
    gap: 14px;
    padding: 16px;
    border-radius: var(--radius-panel);
    border: 1px solid var(--line);
    background: var(--glass-surface);
    box-shadow: var(--surface-shadow);
    backdrop-filter: blur(12px);
  }

  .stage-card.is-active {
    background: var(--active-surface);
  }

  .field-block {
    display: grid;
    gap: 8px;
    padding: 14px;
    border-radius: 22px;
    border: 1px solid var(--line);
    background: var(--field-surface);
  }

  input,
  textarea,
  select {
    width: 100%;
    padding: 13px 14px;
    border-radius: 18px;
    border: 1px solid var(--line);
    background: var(--input-bg);
    color: var(--ink);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  textarea {
    min-height: 92px;
    resize: vertical;
    line-height: 1.6;
  }

  .tag-row,
  .stage-strip,
  .actions,
  .pill-row,
  .theme-chooser {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tag-chip,
  .stage-pill,
  .mini-tag,
  .theme-choice {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 8px 12px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--soft-surface);
    color: var(--ink);
    box-shadow: none;
  }

  .tag-chip.is-active,
  .stage-pill.is-active,
  .theme-choice.is-active {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: transparent;
  }

  .stage-pill.is-done {
    color: var(--ink-soft);
  }

  .status-line {
    min-height: 1.4em;
    font-size: 13px;
    color: var(--ink-soft);
  }

  .empty-state,
  .source-item,
  .queue-item,
  .question-slip,
  .answer-note {
    padding: 14px;
    border-radius: 20px;
    border: 1px solid var(--line);
    background: var(--soft-surface);
  }

  .empty-state {
    border-style: dashed;
    color: var(--ink-muted);
  }

  .source-list,
  .question-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }

  .stage-grid,
  .profile-grid,
  .review-grid {
    display: grid;
    gap: 12px;
  }

  .stat-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stat-card {
    display: grid;
    gap: 6px;
    padding: 14px;
    border-radius: 20px;
    border: 1px solid var(--line);
    background: var(--soft-surface);
  }

  .stat-number {
    font-size: 32px;
  }

  .thread-header {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .thread-header-copy {
    min-width: 0;
  }

  .thread-typing {
    min-width: 36px;
    min-height: 18px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    opacity: 0;
    transition: opacity 180ms ease;
    pointer-events: none;
  }

  .thread-typing.is-visible {
    opacity: 1;
  }

  .chat-stage .thread-header {
    top: var(--chat-sticky-offset);
  }

  .message-list {
    display: grid;
    gap: 12px;
    padding: 6px 0 14px;
    min-height: 52vh;
    align-content: start;
  }

  .bubble {
    display: grid;
    gap: 8px;
    max-width: 82%;
    padding: 12px 14px;
    border-radius: var(--radius-bubble);
    border: 1px solid var(--line);
    background: var(--soft-surface);
    box-shadow: var(--surface-shadow);
    animation: bubble-rise ${uiTokens.motion.chatRevealMs}ms ease;
  }

  .bubble.assistant {
    margin-right: auto;
  }

  .bubble.user {
    margin-left: auto;
    border-color: transparent;
    background: linear-gradient(180deg, var(--accent), var(--accent-deep));
    color: var(--accent-ink);
  }

  .bubble.user .bubble-label {
    color: rgba(17, 22, 28, 0.62);
    opacity: 1;
  }

  .bubble-copy {
    white-space: pre-wrap;
    line-height: 1.68;
    font-size: 15px;
  }

  .bubble.is-pending {
    opacity: 0.94;
  }

  .bubble.user.is-failed {
    border-color: var(--danger);
    background: var(--soft-surface);
    color: var(--ink);
  }

  .bubble.user.is-failed .bubble-label {
    color: var(--ink-soft);
  }

  .bubble-meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 18px;
  }

  .bubble.assistant .bubble-meta-row {
    justify-content: flex-start;
  }

  .bubble.user .bubble-meta-row {
    justify-content: flex-end;
  }

  .bubble-timestamp {
    color: var(--ink-soft);
    font-size: 12px;
    line-height: 1;
  }

  .bubble.user .bubble-timestamp {
    color: rgba(17, 22, 28, 0.64);
  }

  .bubble-status-copy {
    color: var(--ink-soft);
    font-size: 12px;
  }

  .bubble.user.is-failed .bubble-status-copy {
    color: var(--danger);
  }

  .bubble-retry {
    width: 28px;
    min-height: 28px;
    padding: 0;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--soft-surface);
    color: var(--ink);
    box-shadow: none;
  }

  .reply-inspector {
    margin-top: 2px;
    padding-top: 8px;
    border-top: 1px dashed var(--line);
  }

  .reply-inspector summary {
    cursor: pointer;
    color: var(--ink-muted);
    font-size: 13px;
    list-style: none;
  }

  .reply-inspector summary::-webkit-details-marker {
    display: none;
  }

  .composer-shell {
    position: sticky;
    bottom: 86px;
    z-index: 3;
    padding: 10px;
  }

  .chat-stage.chat-focused .composer-shell {
    bottom: 12px;
  }

  .composer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 8px;
  }

  .composer textarea {
    height: 52px;
    min-height: 52px;
    max-height: 120px;
    overflow-y: hidden;
    resize: none;
    scrollbar-color: var(--input-scrollbar-thumb) transparent;
    scrollbar-width: thin;
  }

  .composer textarea::-webkit-scrollbar {
    width: 8px;
  }

  .composer textarea::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 999px;
    margin-block: 10px;
  }

  .composer textarea::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 999px;
    background: var(--input-scrollbar-thumb);
    background-clip: content-box;
  }

  .composer textarea::-webkit-scrollbar-thumb:hover {
    background: var(--input-scrollbar-thumb-hover);
    background-clip: content-box;
  }

  .composer-actions {
    display: flex;
    justify-content: flex-end;
    align-items: stretch;
    gap: 8px;
  }

  .composer-actions button {
    height: 52px;
    min-height: 52px;
    padding-block: 0;
    white-space: nowrap;
  }

  .shell.chat-only .message-list {
    padding-bottom: calc(132px + env(safe-area-inset-bottom));
  }

  .shell.chat-only .chat-stage.chat-focused .composer-shell {
    position: fixed;
    left: 50%;
    bottom: calc(10px + env(safe-area-inset-bottom));
    z-index: 8;
    width: min(calc(100vw - 24px), calc(var(--shell-width) - 24px));
    transform: translateX(-50%);
    gap: 0;
    padding: 8px;
    border-width: 1px;
    border-radius: 24px;
    background:
      radial-gradient(circle at 88% 0%, var(--accent-glow), transparent 8rem),
      var(--glass-surface);
    box-shadow: 0 -18px 34px rgba(0, 0, 0, 0.18);
  }

  .shell.chat-only .chat-stage [data-chat-status] {
    display: none;
  }

  .profile-avatar {
    width: 52px;
    height: 52px;
    border-radius: 18px;
    border: 1px solid var(--line);
    background: var(--hero-surface);
  }

  .profile-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .profile-ident {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .home-stage {
    min-height: calc(100vh - var(--shell-pad-top) - 58px);
    grid-template-rows: auto minmax(0, 1fr);
    align-content: start;
    padding-inline: 0;
    gap: 10px;
  }

  @keyframes bubble-rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes typing-dot {
    0%,
    100% {
      transform: translateY(0) scale(0.84);
      opacity: 0.4;
    }
    50% {
      transform: translateY(-2px) scale(1.12);
      opacity: 1;
    }
  }

  @media (min-width: 768px) {
    :root {
      --shell-pad-top: 32px;
      --shell-pad-bottom: 92px;
    }

    .shell {
      padding-inline: 24px;
    }

    .stage-grid,
    .profile-grid,
    .review-grid {
      grid-template-columns: minmax(0, 1.12fr) minmax(280px, 0.88fr);
      align-items: start;
    }
  }
`;

const baseClientScript = `
  const API_BASE_URL = ${JSON.stringify(apiBaseUrl())};
  const SESSION_KEY = "hall-of-fame-session";
  const THEME_KEY = "hall-of-fame-theme";
  const CURRENT_PERSONA_KEY = "hall-of-fame-current-persona";
  const CURRENT_PERSONA_NAME_KEY = "hall-of-fame-current-persona-name";
  const CURRENT_PERSONA_POSITIONING_KEY = "hall-of-fame-current-persona-positioning";
  const CURRENT_PERSONA_TAGS_KEY = "hall-of-fame-current-persona-tags";

  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const readSession = () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const writeSession = (session) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    renderSession();
  };

  const clearSession = () => {
    localStorage.removeItem(SESSION_KEY);
    renderSession();
  };

  const readCurrentPersonaSelection = () => {
    try {
      const id = localStorage.getItem(CURRENT_PERSONA_KEY);
      if (!id) return null;
      const rawTags = localStorage.getItem(CURRENT_PERSONA_TAGS_KEY);
      const tags = rawTags ? JSON.parse(rawTags) : [];
      return {
        id,
        displayName: localStorage.getItem(CURRENT_PERSONA_NAME_KEY) || "",
        positioning: localStorage.getItem(CURRENT_PERSONA_POSITIONING_KEY) || "",
        tags: Array.isArray(tags) ? tags.filter((item) => typeof item === "string") : [],
      };
    } catch {
      return null;
    }
  };

  const writeCurrentPersonaSelection = (input) => {
    if (!input?.id) return;
    localStorage.setItem(CURRENT_PERSONA_KEY, input.id);
    localStorage.setItem(CURRENT_PERSONA_NAME_KEY, input.displayName || "");
    localStorage.setItem(CURRENT_PERSONA_POSITIONING_KEY, input.positioning || "");
    localStorage.setItem(CURRENT_PERSONA_TAGS_KEY, JSON.stringify(Array.isArray(input.tags) ? input.tags : []));
  };

  const clearCurrentPersonaSelection = () => {
    localStorage.removeItem(CURRENT_PERSONA_KEY);
    localStorage.removeItem(CURRENT_PERSONA_NAME_KEY);
    localStorage.removeItem(CURRENT_PERSONA_POSITIONING_KEY);
    localStorage.removeItem(CURRENT_PERSONA_TAGS_KEY);
  };

  const readTheme = () => {
    try {
      return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  };

  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      const active = button.getAttribute("data-theme-choice") === theme;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    document.querySelectorAll("[data-theme-state]").forEach((slot) => {
      slot.textContent = theme === "dark" ? "深色" : "浅色";
    });
  };

  const writeTheme = (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  };

  const toggleTheme = () => {
    writeTheme(readTheme() === "dark" ? "light" : "dark");
  };

  const authHeaders = (contentType = true) => {
    const headers = {};
    const session = readSession();
    if (contentType) {
      headers["content-type"] = "application/json";
    }
    if (session?.accessToken) {
      headers.authorization = "Bearer " + session.accessToken;
    }
    return headers;
  };

  const requestJson = async (path, options = {}) => {
    const response = await fetch(API_BASE_URL + path, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        ...authHeaders(options.headers?.["content-type"] !== undefined || options.body !== undefined),
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      const error = new Error(typeof body?.message === "string" ? body.message : "请求失败");
      error.status = response.status;
      throw error;
    }
    return body;
  };

  const ensureAnonymousSession = async () => {
    const existing = readSession();
    if (existing?.accessToken && existing.role !== "ANONYMOUS") {
      return existing;
    }

    const session = await requestJson("/v1/auth/anonymous", {
      method: "POST",
      body: JSON.stringify({ deviceId: "h5-browser" }),
    });
    writeSession(session);
    return session;
  };

  const renderSession = () => {};

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-theme-toggle]");
    if (toggle) {
      toggleTheme();
      return;
    }

    const choice = event.target.closest("[data-theme-choice]");
    if (choice) {
      writeTheme(choice.getAttribute("data-theme-choice") === "dark" ? "dark" : "light");
    }
  });

  window.HallOfFameClient = {
    API_BASE_URL,
    escapeHtml,
    readSession,
    writeSession,
    clearSession,
    readCurrentPersonaSelection,
    writeCurrentPersonaSelection,
    clearCurrentPersonaSelection,
    readTheme,
    writeTheme,
    applyTheme,
    toggleTheme,
    requestJson,
    ensureAnonymousSession,
    renderSession,
  };

  window.addEventListener("load", () => {
    applyTheme(readTheme());
    renderSession();
  });
`;

const renderShell = (input: {
  title: string;
  body: string;
  script?: string;
  shellClass?: string;
}) => `<!doctype html>
<html lang="zh-CN" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${input.title}</title>
    <style>${pageStyles}</style>
  </head>
  <body>
    <div class="shell ${input.shellClass ?? ""}">
      <div class="page-frame">
        ${input.body}
      </div>
    </div>
    <script>${baseClientScript}</script>
    <script>${input.script ?? ""}</script>
  </body>
</html>`;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getPersonaMonogram = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "人";
};

const fetchJson = async <T>(path: string): Promise<T | null> => {
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

type FeaturedItem = {
  id: string;
  displayName: string;
  previewIntro: string | null;
  recommendedQuestions: string[];
  originType: string;
};

type PersonaDetail = {
  persona: { displayName: string; currentPublishedVersionId: string; originType: string };
  version: { previewIntro: string | null; recommendedQuestions: string[]; sampleAnswers: string[] };
};

const renderThemeToggleButton = () =>
  `<button type="button" class="icon-button" data-theme-toggle aria-label="切换亮暗模式">◐</button>`;

const formatMessageClock = (value?: string | Date) =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value ? new Date(value) : new Date());

const renderPageHeader = (input: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  extra?: string;
  titleAttrs?: string;
  subtitleAttrs?: string;
  subtitleClass?: string;
}) => `
  <header class="top-bar">
    <div class="top-copy">
      <div class="page-eyebrow">${escapeHtml(input.eyebrow)}</div>
      <h1 class="page-title" ${input.titleAttrs ?? ""}>${escapeHtml(input.title)}</h1>
      ${input.subtitle ? `<p class="page-subtitle${input.subtitleClass ? ` ${input.subtitleClass}` : ""}" ${input.subtitleAttrs ?? ""}>${escapeHtml(input.subtitle)}</p>` : ""}
    </div>
    <div class="top-actions">
      ${input.extra ?? ""}
      ${renderThemeToggleButton()}
    </div>
  </header>
`;

const renderStaticBubble = (input: {
  role: "assistant" | "user";
  label?: string | null;
  content: string;
  timestamp?: string;
}) => `
  <div class="bubble ${input.role}">
    ${input.label ? `<div class="bubble-label">${escapeHtml(input.label)}</div>` : ""}
    <div class="bubble-copy">${escapeHtml(input.content)}</div>
    <div class="bubble-meta-row">
      <span class="bubble-timestamp">${escapeHtml(input.timestamp ?? formatMessageClock())}</span>
    </div>
  </div>
`;

const renderBottomShuttle = (current: "home" | "history" | "create" | "profile") => `
  <nav class="bottom-shuttle" aria-label="主导航">
    <div class="shuttle-track">
      ${[
        { id: "home", label: "聊天", href: "/" },
        { id: "history", label: "列表", href: "/history" },
        { id: "create", label: "创建", href: "/create" },
        { id: "profile", label: "我的", href: "/profile" },
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

type HistoryListItem = {
  id: string;
  displayName: string;
  lastMessage: string;
  updatedAtLabel: string;
  href: string;
};

const renderHistoryItem = (item: HistoryListItem) => `
  <li>
    <a class="history-item" href="${item.href}">
      <div class="history-avatar" aria-hidden="true">${escapeHtml(getPersonaMonogram(item.displayName))}</div>
      <div class="history-main">
        <div class="history-head">
          <h3 class="history-name">${escapeHtml(item.displayName)}</h3>
          <span class="history-time">${escapeHtml(item.updatedAtLabel)}</span>
        </div>
        <p class="history-snippet">${escapeHtml(item.lastMessage)}</p>
      </div>
    </a>
  </li>
`;

const renderHistoryListScript = () => `
  const historyList = document.querySelector("[data-history-list]");

  const formatHistoryTime = (value) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
      return "";
    }

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60 * 1000) {
      return "刚刚";
    }
    if (diff < 60 * 60 * 1000) {
      return Math.max(1, Math.floor(diff / (60 * 1000))) + " 分钟前";
    }
    if (date.toDateString() === now.toDateString()) {
      return Math.max(1, Math.floor(diff / (60 * 60 * 1000))) + " 小时前";
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return "昨天";
    }

    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
    }).format(date);
  };

  const buildHistoryHref = (item) => {
    const appendHistorySource = (href) =>
      href + "?chatId=" + encodeURIComponent(item.id) + "&from=history";

    if (item.targetType === "published_persona" && item.resumePersonaId) {
      return appendHistorySource("/persona/" + encodeURIComponent(item.resumePersonaId));
    }
    if (item.targetType === "draft_version_preview") {
      return appendHistorySource("/preview/" + encodeURIComponent(item.targetPersonaVersionId));
    }
    if (item.targetType === "share_link" && item.shareSlug) {
      return appendHistorySource("/share/" + encodeURIComponent(item.shareSlug));
    }
    return "/";
  };

  const renderEmpty = (copy) => {
    if (!historyList) return;
    historyList.innerHTML =
      "<li class='empty-state'>" +
      HallOfFameClient.escapeHtml(copy || "还没有聊天记录。") +
      "</li>";
  };

  const renderItems = (items) => {
    if (!historyList) return;
    if (!items.length) {
      renderEmpty("还没有聊天记录。先去聊一轮。");
      return;
    }

    historyList.innerHTML = items
      .map((item) => {
        return (
          "<li>" +
          "<a class='history-item' href='" +
          buildHistoryHref(item) +
          "'>" +
          "<div class='history-avatar' aria-hidden='true'>" +
          HallOfFameClient.escapeHtml((item.displayName || "人").trim().slice(0, 1).toUpperCase() || "人") +
          "</div>" +
          "<div class='history-main'>" +
          "<div class='history-head'>" +
          "<h3 class='history-name'>" +
          HallOfFameClient.escapeHtml(item.displayName || "对象") +
          "</h3>" +
          "<span class='history-time'>" +
          HallOfFameClient.escapeHtml(formatHistoryTime(item.updatedAt)) +
          "</span>" +
          "</div>" +
          "<p class='history-snippet'>" +
          HallOfFameClient.escapeHtml(item.latestMessage || "") +
          "</p>" +
          "</div>" +
          "</a>" +
          "</li>"
        );
      })
      .join("");
  };

  const loadHistory = async () => {
    if (!historyList) return;

    try {
      await HallOfFameClient.ensureAnonymousSession();
      const result = await HallOfFameClient.requestJson("/v1/chats", {
        method: "GET",
      });
      renderItems(result.items || []);
    } catch (error) {
      if (error?.status === 401 || error?.message === "Authentication required") {
        try {
          HallOfFameClient.clearSession();
          await HallOfFameClient.ensureAnonymousSession();
          const result = await HallOfFameClient.requestJson("/v1/chats", {
            method: "GET",
          });
          renderItems(result.items || []);
          return;
        } catch {
          renderEmpty("还没有聊天记录。先去聊一轮。");
          return;
        }
      }
      renderEmpty(error instanceof Error ? error.message : "加载聊天列表失败");
    }
  };

  void loadHistory();
`;

const renderFeaturedCarouselScript = () => `
  const viewport = document.querySelector("[data-carousel-viewport]");
  const cards = Array.from(document.querySelectorAll("[data-carousel-card]"));
  const dots = Array.from(document.querySelectorAll("[data-carousel-dot]"));

  if (viewport && cards.length) {
    let frame = 0;
    let pointerStart = null;
    let suppressClick = false;

    const scrollToCard = (index, behavior = "smooth") => {
      const card = cards[index];
      if (!card) return;

      const left = card.offsetLeft - Math.max((viewport.clientWidth - card.clientWidth) / 2, 0);
      viewport.scrollTo({
        left,
        behavior,
      });
    };

    const updateActiveCard = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const viewportCenter = viewportRect.left + viewportRect.width / 2;
      let activeIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.left + rect.width / 2;
        const distance = Math.abs(cardCenter - viewportCenter);
        if (distance < bestDistance) {
          bestDistance = distance;
          activeIndex = index;
        }
      });

      cards.forEach((card, index) => {
        const isCurrent = index === activeIndex;
        card.classList.toggle("is-current", isCurrent);
        card.classList.toggle("is-peek", !isCurrent);
        card.setAttribute("aria-current", isCurrent ? "true" : "false");
      });

      dots.forEach((dot, index) => {
        dot.classList.toggle("is-active", index === activeIndex);
        dot.setAttribute("aria-pressed", index === activeIndex ? "true" : "false");
      });
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateActiveCard);
    };

    viewport.addEventListener("pointerdown", (event) => {
      pointerStart = {
        x: event.clientX,
        y: event.clientY,
      };
      suppressClick = false;
    });

    viewport.addEventListener("pointermove", (event) => {
      if (!pointerStart) return;
      const movedX = Math.abs(event.clientX - pointerStart.x);
      const movedY = Math.abs(event.clientY - pointerStart.y);
      if (movedX > 8 || movedY > 8) {
        suppressClick = true;
      }
    });

    const clearGesture = () => {
      window.setTimeout(() => {
        pointerStart = null;
        suppressClick = false;
      }, 0);
    };

    viewport.addEventListener("pointerup", clearGesture);
    viewport.addEventListener("pointercancel", clearGesture);

    viewport.addEventListener("click", (event) => {
      const card = event.target.closest("[data-carousel-card]");
      if (card && suppressClick) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    viewport.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    dots.forEach((dot) => {
      dot.addEventListener("click", () => {
        const index = Number(dot.getAttribute("data-carousel-dot-index") || "0");
        scrollToCard(index);
      });
    });

    scheduleUpdate();
  }
`;

export const buildFeaturedListBody = (items: FeaturedItem[]) => `
  <div class="page-stage home-stage">
    <div class="page-copy-inset">
      ${renderPageHeader({
        eyebrow: "Hall of Fame",
        title: "只差一句开场",
      })}
    </div>
    <section class="persona-carousel" aria-label="精选对象">
      ${
        items.length
          ? `
            <div class="carousel-viewport" data-carousel-viewport>
              ${items
                .map(
                  (item, index) => `
                    <a class="carousel-card ${index === 0 ? "is-current" : "is-peek"}" href="/persona/${item.id}" data-carousel-card data-carousel-index="${index}" aria-current="${index === 0 ? "true" : "false"}">
                      <div class="card-image" aria-hidden="true"><span class="card-monogram">${escapeHtml(getPersonaMonogram(item.displayName))}</span></div>
                      <div class="card-meta">
                        <span class="badge">精选</span>
                      </div>
                      <h2 class="card-name">${escapeHtml(item.displayName)}</h2>
                      <p class="card-hook">${escapeHtml(item.previewIntro ?? "先认识一下")}</p>
                    </a>
                  `,
                )
                .join("")}
            </div>
            <div class="hero-dots" aria-hidden="true">
              ${items
                .map(
                  (_item, index) => `
                    <button
                      type="button"
                      class="hero-dot ${index === 0 ? "is-active" : ""}"
                      data-carousel-dot
                      data-carousel-dot-index="${index}"
                      aria-label="切换到第 ${index + 1} 个对象"
                      aria-pressed="${index === 0 ? "true" : "false"}"
                    ></button>
                  `,
                )
                .join("")}
            </div>
          `
          : '<div class="empty-state">内容准备中。</div>'
      }
    </section>
    ${renderBottomShuttle("home")}
  </div>
`;

export const buildHistoryPageBody = (input: {
  items: HistoryListItem[];
}) => `
  <div class="page-stage history-stage">
    ${renderPageHeader({
      eyebrow: "List",
      title: "聊天列表",
      subtitle: "之前聊过的对象，都在这里。",
    })}

    <section class="history-section">
      <ul class="history-list" data-history-list>
        ${input.items.length ? input.items.map((item) => renderHistoryItem(item)).join("") : '<li class="empty-state">还没有聊天记录。</li>'}
      </ul>
    </section>

    ${renderBottomShuttle("history")}
  </div>
`;

export const buildPersonaPageBody = (
  detail: PersonaDetail,
  options: {
    returnHref?: string;
  } = {},
) => `
  <div class="page-stage chat-stage chat-focused">
    ${renderPageHeader({
      eyebrow: "聊天",
      title: detail.persona.displayName,
      subtitle: "等你开口",
      titleAttrs: "data-thread-name",
      subtitleAttrs: "data-thread-status",
      subtitleClass: "thread-status",
      extra: `<div class="thread-typing" data-thread-typing aria-label="正在输入中"></div><a class="mini-link" href="${escapeHtml(options.returnHref ?? "/")}">返回</a>`,
    })}
    <section class="thread-screen">
      <div class="message-list" data-chat-log data-chat-assistant-name="${escapeHtml(detail.persona.displayName)}">
        ${renderStaticBubble({
          role: "assistant",
          label: detail.persona.displayName,
          content: detail.version.previewIntro ?? detail.version.sampleAnswers[0] ?? "聊聊吧",
        })}
      </div>
      <section class="composer-shell">
        <form data-chat-form class="composer">
          <textarea placeholder="输入你想说的话"></textarea>
          <div class="composer-actions">
            <button type="submit">发送</button>
          </div>
        </form>
        <div class="status-line" data-chat-status></div>
      </section>
    </section>
  </div>
`;

export const buildCreatePageBody = () => `
  <div class="page-stage">
    ${renderPageHeader({
      eyebrow: "创建",
      title: "先创建对象",
      subtitle: "先建一个，再慢慢补全。",
    })}

    <section class="shell-panel" data-create-light-start>
      <div class="mini-eyebrow">创建</div>
      <h2 class="section-title">创建新对象</h2>
      <p class="body-copy">先填名字、简介和风格。</p>
      <form data-create-form class="field-stack">
        <label class="field-block">
          <span class="field-label">名称</span>
          <input name="displayName" placeholder="例如：王阳明式教练" />
        </label>
        <label class="field-block">
          <span class="field-label">一句话简介</span>
          <textarea name="positioning" placeholder="例如：清醒直接，擅长理清思路"></textarea>
        </label>
        <div class="field-block">
          <span class="field-label">风格</span>
          <div class="tag-row">
            <button type="button" class="tag-chip" data-tag-value="清醒">清醒</button>
            <button type="button" class="tag-chip" data-tag-value="锋利">锋利</button>
            <button type="button" class="tag-chip" data-tag-value="克制">克制</button>
            <button type="button" class="tag-chip" data-tag-value="判断">判断</button>
            <button type="button" class="tag-chip" data-tag-value="表达">表达</button>
            <button type="button" class="tag-chip" data-tag-value="行动">行动</button>
          </div>
          <input name="customTags" placeholder="自定义标签，逗号分隔" />
        </div>
        <div class="actions">
          <button type="submit">创建</button>
        </div>
      </form>
      <div class="status-line" data-create-status></div>
    </section>

    <section class="shell-panel" data-create-success hidden>
      <div class="mini-eyebrow">创建成功</div>
      <h2 class="section-title">创建好了</h2>
      <p class="body-copy">先补资料，再去预览。</p>
      <div class="summary-card">
        <strong data-created-name>新对象</strong>
      </div>
      <div class="actions">
        <button type="button" data-open-workbench>添加资料</button>
      </div>
    </section>

    <section class="workbench-shell" data-create-workbench hidden>
      <div class="stage-strip" aria-label="创建阶段">
        <span class="stage-pill is-done">对象定义</span>
        <span class="stage-pill is-active">资料管理</span>
        <span class="stage-pill">预览</span>
        <span class="stage-pill">发布</span>
      </div>

      <section class="summary-card">
        <div class="mini-eyebrow">对象定义</div>
        <h2 class="section-title" data-definition-name>未创建</h2>
        <p class="summary-copy" data-definition-positioning>创建后会在这里看到简介。</p>
        <div class="pill-row" data-definition-tags><span class="mini-tag">暂无标签</span></div>
        <div class="actions">
          <button type="button" class="secondary" data-edit-definition>修改定义</button>
        </div>
      </section>

      <div class="stage-grid">
        <section class="stage-card is-active">
          <div class="mini-eyebrow">资料管理</div>
          <h2 class="section-title">先把资料喂进去</h2>
          <p class="body-copy">文本和链接都能加，但主推文本资料，先把最低门槛的动作做顺。</p>
          <p class="meta">当前对象：<span data-persona-id>未创建</span></p>
          <form data-text-source-form class="field-stack">
            <label class="field-block">
              <span class="field-label">资料标题</span>
              <input name="title" placeholder="例如：访谈摘录" />
            </label>
            <label class="field-block">
              <span class="field-label">资料类型</span>
              <select name="sourceKind">
                <option value="PRIMARY">PRIMARY</option>
                <option value="SECONDARY">SECONDARY</option>
                <option value="SUMMARY">SUMMARY</option>
              </select>
            </label>
            <label class="field-block">
              <span class="field-label">资料内容</span>
              <textarea name="content" placeholder="粘贴资料内容"></textarea>
            </label>
            <div class="actions">
              <button type="submit">添加文本</button>
            </div>
          </form>

          <form data-url-source-form class="field-stack">
            <label class="field-block">
              <span class="field-label">公开链接</span>
              <input name="url" placeholder="https://example.com/article" />
            </label>
            <label class="field-block">
              <span class="field-label">可选标题</span>
              <input name="title" placeholder="可自定义资料标题" />
            </label>
            <label class="field-block">
              <span class="field-label">资料类型</span>
              <select name="sourceKind">
                <option value="PRIMARY">PRIMARY</option>
                <option value="SECONDARY">SECONDARY</option>
                <option value="SUMMARY">SUMMARY</option>
              </select>
            </label>
            <div class="actions">
              <button type="submit" class="secondary">导入链接</button>
            </div>
          </form>

          <div class="status-line" data-source-status></div>
          <ul class="source-list" data-source-list><li class="empty-state">还没有资料</li></ul>
        </section>

        <div class="list-stack">
          <section class="stage-card">
            <div class="mini-eyebrow">预览</div>
            <h3 class="card-title">先听它怎么开口</h3>
            <p class="body-copy">资料补完后先预览，确认像它，再决定怎么使用。</p>
            <div class="actions">
              <button type="button" data-open-preview>进入预览</button>
            </div>
          </section>

          <section class="stage-card">
            <div class="mini-eyebrow">使用方式</div>
            <h3 class="card-title">预览后再决定</h3>
            <p class="body-copy">你可以选择仅自己使用，也可以直接公开分享。</p>
          </section>
        </div>
      </div>
    </section>

    ${renderBottomShuttle("create")}
  </div>
`;

export const buildReviewPageBody = () => `
  <div class="page-stage">
    ${renderPageHeader({
      eyebrow: "Review",
      title: "审核入口",
      subtitle: "作为我的里的次级入口存在，不再和开口、创建平级。",
      extra: '<a class="mini-link" href="/profile">返回我的</a>',
    })}
    <section class="shell-panel stack">
      <div class="mini-eyebrow">身份</div>
      <h2 class="section-title">切换 reviewer</h2>
      <div class="actions">
        <button type="button" data-reviewer-login>进入 reviewer 身份</button>
        <button type="button" class="secondary" data-clear-session>清除当前身份</button>
      </div>
      <div class="status-line" data-reviewer-status></div>
    </section>
    <section class="review-grid">
      <section class="stage-card">
        <div class="mini-eyebrow">资料审核</div>
        <h3 class="card-title">待审资料</h3>
        <ul class="question-list" data-source-review-list><li class="empty-state">请先登录 reviewer</li></ul>
      </section>
      <section class="stage-card">
        <div class="mini-eyebrow">发布审核</div>
        <h3 class="card-title">待审发布</h3>
        <ul class="question-list" data-version-review-list><li class="empty-state">请先登录 reviewer</li></ul>
      </section>
    </section>
    ${renderBottomShuttle("profile")}
  </div>
`;

export const buildProfilePageBody = () => `
  <div class="page-stage">
    ${renderPageHeader({
      eyebrow: "My",
      title: "我的",
      subtitle: "你的设置和对象都在这里。",
    })}

    <section class="profile-card">
      <div class="profile-ident">
        <div class="profile-avatar" aria-hidden="true"></div>
        <div class="top-copy">
          <strong>身份</strong>
          <p class="meta" data-profile-session-copy>匿名体验</p>
        </div>
      </div>
    </section>

    <div class="stat-grid">
      <section class="stat-card">
        <div class="mini-eyebrow">草稿</div>
        <div class="stat-number" data-profile-draft-count>0</div>
      </section>
      <section class="stat-card">
        <div class="mini-eyebrow">已发布</div>
        <div class="stat-number" data-profile-published-count>0</div>
      </section>
    </div>

    <section class="profile-card">
      <div class="mini-eyebrow">我的对象</div>
      <div class="list-stack" data-profile-persona-list>
        <div class="empty-state">加载中...</div>
      </div>
    </section>

    <section class="profile-card">
      <div class="mini-eyebrow">常用操作</div>
      <div class="list-stack">
        <a class="utility-link" href="/create">去创建</a>
        <a class="utility-link secondary" href="/">回到聊天</a>
      </div>
    </section>

    ${renderBottomShuttle("profile")}
  </div>
`;

const renderFeaturedList = async () => {
  const featured = await fetchJson<{ items: FeaturedItem[] }>("/v1/personae/featured");
  const items = (featured?.items ?? []).filter((item) => item.originType === "OFFICIAL");

  return renderShell({
    title: "聊天",
    body: buildFeaturedListBody(items),
    script: renderFeaturedCarouselScript(),
  });
};

const renderHistoryPage = async () => {
  return renderShell({
    title: "聊天列表",
    body: buildHistoryPageBody({
      items: [],
    }),
    script: renderHistoryListScript(),
  });
};

const renderChatScript = (input: {
  targetType: "published_persona" | "draft_version_preview" | "share_link";
  targetValue: string;
  assistantName?: string;
  initialChatId?: string | null;
}) => `
  const form = document.querySelector("[data-chat-form]");
  const log = document.querySelector("[data-chat-log]");
  const status = document.querySelector("[data-chat-status]");
  const threadTyping = document.querySelector("[data-thread-typing]");
  const initialChatId = ${JSON.stringify(input.initialChatId ?? null)};
  let chatId = initialChatId;
  let chatCreation = null;
  let pendingDeliveries = 0;
  const assistantName = ${JSON.stringify(input.assistantName ?? null)}
    || log?.getAttribute("data-chat-assistant-name")
    || document.querySelector("[data-thread-name]")?.textContent?.trim()
    || "对象";
  const composerInput = form?.querySelector("textarea");

  const setStatus = (content) => {
    if (status) status.textContent = content;
  };

  const syncComposerHeight = () => {
    if (!composerInput) return;
    const minHeight = 52;
    const maxHeight = 120;
    composerInput.style.height = minHeight + "px";
    const nextHeight = Math.min(Math.max(composerInput.scrollHeight, minHeight), maxHeight);
    composerInput.style.height = nextHeight + "px";
    composerInput.style.overflowY = composerInput.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  const buildTypingIndicator = () => {
    const indicator = document.createElement("span");
    indicator.className = "typing-indicator";
    indicator.setAttribute("aria-hidden", "true");
    Array.from({ length: 3 }).forEach((_, index) => {
      const dot = document.createElement("span");
      dot.className = "typing-indicator-dot";
      dot.style.animationDelay = index * 0.15 + "s";
      indicator.appendChild(dot);
    });
    return indicator;
  };

  const syncThreadTyping = () => {
    if (!threadTyping) return;
    if (pendingDeliveries > 0) {
      threadTyping.classList.add("is-visible");
      threadTyping.replaceChildren(buildTypingIndicator());
      return;
    }

    threadTyping.classList.remove("is-visible");
    threadTyping.replaceChildren();
  };

  const formatBubbleClock = (value) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
    }

    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  };

  const scrollLogToLatest = (behavior = "auto") => {
    if (!log) return;
    const perform = () => {
      log.lastElementChild?.scrollIntoView({ block: "end", behavior, inline: "nearest" });
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
    };
    requestAnimationFrame(() => requestAnimationFrame(perform));
  };

  const ensureBubbleMetaRow = (bubble) => {
    let row = bubble.querySelector(".bubble-meta-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "bubble-meta-row";
      bubble.appendChild(row);
    }
    return row;
  };

  const buildTimestampCopy = (content) => {
    const copy = document.createElement("span");
    copy.className = "bubble-timestamp";
    copy.textContent = content;
    return copy;
  };

  const buildStatusCopy = (content) => {
    const copy = document.createElement("span");
    copy.className = "bubble-status-copy";
    copy.textContent = content;
    return copy;
  };

  const buildRetryButton = (content) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bubble-retry";
    button.textContent = "↻";
    button.setAttribute("aria-label", "重试");
    button.setAttribute("title", "重试");
    button.dataset.chatRetry = content;
    return button;
  };

  const renderBubbleMeta = (bubble, input = {}) => {
    const row = ensureBubbleMetaRow(bubble);
    const timestamp = bubble.getAttribute("data-message-time") || formatBubbleClock();
    const nodes = [buildTimestampCopy(timestamp)];

    if (input.statusLabel) {
      nodes.push(buildStatusCopy(input.statusLabel));
    }

    if (input.retryContent) {
      nodes.push(buildRetryButton(input.retryContent));
    }

    row.replaceChildren(...nodes);
  };

  const setUserBubblePending = (bubble) => {
    bubble.classList.add("is-pending");
    bubble.classList.remove("is-failed");
    renderBubbleMeta(bubble, { statusLabel: "发送中" });
  };

  const setUserBubbleDelivered = (bubble) => {
    bubble.classList.remove("is-pending", "is-failed");
    renderBubbleMeta(bubble);
  };

  const setUserBubbleFailed = (bubble, label) => {
    bubble.classList.remove("is-pending");
    bubble.classList.add("is-failed");
    renderBubbleMeta(bubble, {
      statusLabel: label,
      retryContent: bubble.getAttribute("data-message-content") || "",
    });
  };

  const seenMessageIds = new Set();
  let realtimeSocket = null;
  let realtimeSubscribedChatId = null;

  const appendBubble = (role, content, scrollBehavior = "auto", createdAt = null, messageId = null) => {
    if (messageId) {
      seenMessageIds.add(messageId);
    }
    const bubble = document.createElement("div");
    bubble.className = "bubble " + (role === "ASSISTANT" ? "assistant" : "user");
    bubble.setAttribute("data-message-content", content);
    bubble.setAttribute("data-message-time", formatBubbleClock(createdAt));
    if (messageId) {
      bubble.setAttribute("data-message-id", messageId);
    }

    const copy = document.createElement("div");
    copy.className = "bubble-copy";
    copy.textContent = content;

    if (role === "ASSISTANT") {
      const label = document.createElement("div");
      label.className = "bubble-label";
      label.textContent = assistantName;
      bubble.append(label);
    }

    bubble.append(copy);
    renderBubbleMeta(bubble);

    log.appendChild(bubble);
    if (scrollBehavior) {
      scrollLogToLatest(scrollBehavior);
    }
    return bubble;
  };

  const appendMessageIfMissing = (message, scrollBehavior = "auto") => {
    if (!message || !message.id || seenMessageIds.has(message.id)) {
      return null;
    }
    return appendBubble(message.role, message.content, scrollBehavior, message.createdAt || null, message.id);
  };

  const renderExistingMessages = (messages) => {
    if (!log || !Array.isArray(messages) || !messages.length) {
      return false;
    }

    log.replaceChildren();
    seenMessageIds.clear();
    messages.forEach((message) => {
      appendMessageIfMissing(message, null);
    });
    scrollLogToLatest("auto");
    return true;
  };

  const realtimeUrl = () => {
    try {
      const url = new URL(HallOfFameClient.API_BASE_URL);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = "/v1/realtime";
      url.search = "";
      return url.toString();
    } catch {
      return null;
    }
  };

  const connectRealtime = (sessionId) => {
    if (!sessionId || realtimeSubscribedChatId === sessionId || typeof WebSocket === "undefined") {
      return;
    }
    const session = HallOfFameClient.readSession();
    const url = realtimeUrl();
    if (!session?.accessToken || !url) {
      return;
    }

    realtimeSubscribedChatId = sessionId;
    try {
      if (realtimeSocket) {
        realtimeSocket.close();
      }
      realtimeSocket = new WebSocket(url);
      realtimeSocket.addEventListener("open", () => {
        realtimeSocket.send(JSON.stringify({
          type: "auth.subscribe",
          token: session.accessToken,
          chatId: sessionId,
        }));
      });
      realtimeSocket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "chat.message.created") {
            appendMessageIfMissing(payload.message, "auto");
          }
          if (payload.type === "chat.turn.failed") {
            setStatus(payload.message || "回复失败");
          }
        } catch {
          // Ignore malformed realtime frames; history reload remains the source of truth.
        }
      });
      realtimeSocket.addEventListener("close", () => {
        if (realtimeSubscribedChatId === sessionId) {
          realtimeSubscribedChatId = null;
        }
      });
    } catch {
      realtimeSubscribedChatId = null;
    }
  };

  const loadExistingChat = async () => {
    if (!initialChatId) {
      return;
    }

    try {
      await HallOfFameClient.ensureAnonymousSession();
      const session = await HallOfFameClient.requestJson("/v1/chats/" + encodeURIComponent(initialChatId), {
        method: "GET",
      });
      chatId = session.id || initialChatId;
      connectRealtime(chatId);
      renderExistingMessages(session.messages || []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "加载聊天记录失败");
    }
  };

  const ensureChatId = async () => {
    if (chatId) return chatId;
    if (chatCreation) return await chatCreation;

    await HallOfFameClient.ensureAnonymousSession();

    const payload = ${input.targetType === "published_persona"
      ? `{ targetType: "published_persona", personaId: "${input.targetValue}" }`
      : input.targetType === "draft_version_preview"
        ? `{ targetType: "draft_version_preview", personaVersionId: "${input.targetValue}" }`
        : `{ targetType: "share_link", shareSlug: "${input.targetValue}" }`};

    chatCreation = HallOfFameClient.requestJson("/v1/chats", {
      method: "POST",
      body: JSON.stringify(payload),
    })
      .then((created) => {
        chatId = created.id;
        connectRealtime(chatId);
        return chatId;
      })
      .finally(() => {
        chatCreation = null;
      });

    return await chatCreation;
  };

  const deliverUserBubble = async (bubble, content) => {
    let failureLabel = "发送失败";
    bubble.setAttribute("data-message-time", formatBubbleClock());
    setUserBubblePending(bubble);
    pendingDeliveries += 1;
    syncThreadTyping();

    try {
      const sessionId = await ensureChatId();
      failureLabel = "回复失败";
      const reply = await HallOfFameClient.requestJson("/v1/chats/" + sessionId + "/messages", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setUserBubbleDelivered(bubble);
      if (reply && reply.status === "accepted") {
        if (reply.message?.id) {
          bubble.setAttribute("data-message-id", reply.message.id);
          seenMessageIds.add(reply.message.id);
        }
        return;
      }
      appendMessageIfMissing(reply, "auto");
    } catch (error) {
      setUserBubbleFailed(bubble, failureLabel);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      pendingDeliveries = Math.max(0, pendingDeliveries - 1);
      syncThreadTyping();
    }
  };

  log?.addEventListener("click", (event) => {
    const retryButton = event.target.closest("[data-chat-retry]");
    if (!retryButton) return;
    const bubble = retryButton.closest(".bubble.user");
    const retryContent = retryButton.getAttribute("data-chat-retry") || bubble?.getAttribute("data-message-content") || "";
    if (!bubble || !retryContent) return;
    void deliverUserBubble(bubble, retryContent);
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = composerInput;
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;
    const userBubble = appendBubble("USER", content, "auto");
    input.value = "";
    syncComposerHeight();
    void deliverUserBubble(userBubble, content);
  });

  composerInput?.addEventListener("input", syncComposerHeight);
  syncComposerHeight();
  void loadExistingChat();
`;

const getSingleQueryValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : null;
  }
  return typeof value === "string" ? value : null;
};

const renderPersonaPage = async (
  personaId: string,
  query: {
    chatId?: string | string[];
    from?: string | string[];
  } = {},
) => {
  const detail = await fetchJson<PersonaDetail>(`/v1/personae/${personaId}`);

  if (!detail) {
    return renderShell({
      title: "对象不存在",
      body: '<div class="empty-state">请返回首页重新选择对象。</div>',
    });
  }

  const initialChatId = getSingleQueryValue(query.chatId);
  const returnHref = getSingleQueryValue(query.from) === "history" ? "/history" : "/";

  return renderShell({
    title: `和${detail.persona.displayName}聊天`,
    body: buildPersonaPageBody(detail, { returnHref }),
    shellClass: "chat-only",
    script: renderChatScript({
      targetType: "published_persona",
      targetValue: personaId,
      assistantName: detail.persona.displayName,
      initialChatId,
    }),
  });
};

const renderSharePage = async (shareSlug: string) => {
  const landing = await fetchJson<{
    share: { canonicalUrl: string; shareSlug: string };
    persona: { displayName: string; originType: string };
    version: { id: string; previewIntro: string | null; recommendedQuestions: string[] };
  }>(`/v1/shares/${shareSlug}`);

  if (!landing) {
    return renderShell({
      title: "分享不存在",
      body: '<div class="empty-state">请确认 share slug 是否正确。</div>',
    });
  }

  return renderShell({
    title: `和${landing.persona.displayName}聊聊`,
    body: `
      <div class="page-stage chat-stage">
        ${renderPageHeader({
          eyebrow: "Share",
          title: landing.persona.displayName,
          subtitle: "从这里直接继续聊天。",
          extra: '<a class="mini-link" href="/">返回聊天</a>',
        })}
        <section class="thread-screen">
          <header class="thread-header">
            <div class="thread-header-copy">
              <h2 class="thread-name" data-thread-name>${escapeHtml(landing.persona.displayName)}</h2>
              <p class="thread-status" data-thread-status>继续聊天</p>
            </div>
            <div class="thread-typing" data-thread-typing aria-label="正在输入中"></div>
          </header>
          <div class="message-list" data-chat-log data-chat-assistant-name="${escapeHtml(landing.persona.displayName)}">
            ${renderStaticBubble({
              role: "assistant",
              label: landing.persona.displayName,
              content: landing.version.previewIntro ?? "先聊一句",
            })}
          </div>
          <section class="composer-shell">
            <form data-chat-form class="composer">
              <textarea placeholder="说点什么"></textarea>
              <div class="composer-actions">
                <button type="submit">发送</button>
              </div>
            </form>
            <div class="status-line" data-chat-status></div>
          </section>
        </section>
        ${renderBottomShuttle("home")}
      </div>
    `,
    script: renderChatScript({
      targetType: "share_link",
      targetValue: shareSlug,
      assistantName: landing.persona.displayName,
    }),
  });
};

const renderCreatePage = () =>
  renderShell({
    title: "创建",
    body: buildCreatePageBody(),
    script: `
      const createStatus = document.querySelector("[data-create-status]");
      const sourceStatus = document.querySelector("[data-source-status]");
      const lightStartShell = document.querySelector("[data-create-light-start]");
      const successShell = document.querySelector("[data-create-success]");
      const workbenchShell = document.querySelector("[data-create-workbench]");
      const personaSlot = document.querySelector("[data-persona-id]");
      const sourceList = document.querySelector("[data-source-list]");
      const createdNameSlot = document.querySelector("[data-created-name]");
      const definitionNameSlot = document.querySelector("[data-definition-name]");
      const definitionPositioningSlot = document.querySelector("[data-definition-positioning]");
      const definitionTagsSlot = document.querySelector("[data-definition-tags]");
      const tagButtons = Array.from(document.querySelectorAll("[data-tag-value]"));
      const initialPersonaId = new URLSearchParams(window.location.search).get("personaId");
      let personaId = null;
      let openedFromExistingPersona = false;

      const collectTags = () => {
        const selected = tagButtons
          .filter((button) => button.classList.contains("is-active"))
          .map((button) => button.getAttribute("data-tag-value") || "")
          .filter(Boolean);
        const custom = String(document.querySelector("[name='customTags']")?.value || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        return Array.from(new Set([...selected, ...custom])).slice(0, 4);
      };

      const storeCurrentPersona = (input) => {
        HallOfFameClient.writeCurrentPersonaSelection({
          id: input.personaId,
          displayName: input.displayName,
          positioning: input.positioning,
          tags: input.tags,
        });
      };

      const renderDefinitionSummary = (displayName, positioning, tags) => {
        if (createdNameSlot) createdNameSlot.textContent = displayName;
        if (definitionNameSlot) definitionNameSlot.textContent = displayName;
        if (definitionPositioningSlot) definitionPositioningSlot.textContent = positioning;
        if (personaSlot) personaSlot.textContent = personaId || "未创建";
        if (definitionTagsSlot) {
          definitionTagsSlot.innerHTML = tags.length
            ? tags.map((tag) => "<span class='mini-tag'>" + HallOfFameClient.escapeHtml(tag) + "</span>").join("")
            : "<span class='mini-tag'>暂无标签</span>";
        }
      };

      const showState = (state) => {
        if (lightStartShell) lightStartShell.hidden = state !== "light-start";
        if (successShell) successShell.hidden = state !== "success";
        if (workbenchShell) workbenchShell.hidden = state !== "workbench";
      };

      const refreshSources = async () => {
        if (!sourceList) return;
        if (!personaId) {
          sourceList.innerHTML = "<li class='empty-state'>还没有资料</li>";
          return;
        }

        try {
          const result = await HallOfFameClient.requestJson("/v1/personae/" + personaId + "/sources");
          const items = result.items || [];
          sourceList.innerHTML = items.length
            ? items
                .map(
                  (item) =>
                    "<li class='source-item'><strong>" +
                    HallOfFameClient.escapeHtml(item.sourceTitle || item.id) +
                    "</strong><div class='meta'>" +
                    HallOfFameClient.escapeHtml(item.inputType + " / " + item.sourceKind + " / 可预览") +
                    "</div><p class='body-copy'>" +
                    HallOfFameClient.escapeHtml(item.sourceSummary || "") +
                    "</p></li>",
                )
                .join("")
            : "<li class='empty-state'>还没有资料</li>";
        } catch (error) {
          sourceList.innerHTML = "<li class='empty-state'>" + HallOfFameClient.escapeHtml(error instanceof Error ? error.message : String(error)) + "</li>";
        }
      };

      const loadManagedPersona = async () => {
        if (!initialPersonaId) {
          return;
        }

        try {
          const dashboard = await HallOfFameClient.requestJson("/v1/me/personae", { method: "GET" });
          const current = (dashboard.items || []).find((item) => item.personaId === initialPersonaId);
          if (!current) {
            if (createStatus) {
              createStatus.textContent = "没有找到这个对象。";
            }
            return;
          }

          openedFromExistingPersona = true;
          personaId = current.personaId;
          storeCurrentPersona({
            personaId: current.personaId,
            displayName: current.displayName,
            positioning: current.positioning || current.previewIntro || "",
            tags: current.distillFocus || [],
          });
          renderDefinitionSummary(current.displayName, current.positioning || current.previewIntro || "继续补资料后再预览。", current.distillFocus || []);
          showState("workbench");
          if (sourceStatus) {
            sourceStatus.textContent = current.currentPublishedVersionId ? "继续补资料或重新预览。" : "继续补资料。";
          }
          await refreshSources();
        } catch (error) {
          if (createStatus) {
            createStatus.textContent = error instanceof Error ? error.message : String(error);
          }
        }
      };

      tagButtons.forEach((button) => {
        button.addEventListener("click", () => {
          button.classList.toggle("is-active");
        });
      });

      document.querySelector("[data-create-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await HallOfFameClient.ensureAnonymousSession();
        const form = event.currentTarget;
        const displayName = String(new FormData(form).get("displayName") || "").trim();
        const positioning = String(new FormData(form).get("positioning") || "").trim();
        const tags = collectTags();

        if (!displayName) {
          createStatus.textContent = "请填写名称";
          return;
        }
        if (!positioning) {
          createStatus.textContent = "请填写一句话简介";
          return;
        }
        if (!tags.length) {
          createStatus.textContent = "至少选择一个风格";
          return;
        }

        createStatus.textContent = "创建中…";

        try {
          const result = await HallOfFameClient.requestJson("/v1/personae", {
            method: "POST",
            body: JSON.stringify({
              displayName,
              positioning,
              personaType: "ORIGINAL_PERSONA",
              originType: "USER",
              distillFocus: tags,
            }),
          });

          personaId = result.id;
          storeCurrentPersona({
            personaId,
            displayName,
            positioning,
            tags,
          });
          window.history.replaceState({}, "", "/create?personaId=" + encodeURIComponent(personaId));
          renderDefinitionSummary(displayName, positioning, tags);
          createStatus.textContent = "";
          showState("success");
        } catch (error) {
          createStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      document.querySelector("[data-open-workbench]")?.addEventListener("click", async () => {
        showState("workbench");
        if (sourceStatus) sourceStatus.textContent = "先添加资料";
        await refreshSources();
      });

      document.querySelector("[data-edit-definition]")?.addEventListener("click", () => {
        if (openedFromExistingPersona) {
          sourceStatus.textContent = "当前阶段先继续补资料，回改定义后续再补。";
          return;
        }
        showState("light-start");
      });

      document.querySelector("[data-text-source-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!personaId) {
          sourceStatus.textContent = "请先创建对象。";
          return;
        }
        const form = new FormData(event.currentTarget);
        sourceStatus.textContent = "添加中…";
        try {
          await HallOfFameClient.requestJson("/v1/personae/" + personaId + "/sources/text", {
            method: "POST",
            body: JSON.stringify({
              title: String(form.get("title") || ""),
              sourceKind: String(form.get("sourceKind") || "PRIMARY"),
              content: String(form.get("content") || ""),
            }),
          });
          sourceStatus.textContent = "已添加，可用于预览。";
          event.currentTarget.reset();
          await refreshSources();
        } catch (error) {
          sourceStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      document.querySelector("[data-url-source-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!personaId) {
          sourceStatus.textContent = "请先创建对象。";
          return;
        }
        const form = new FormData(event.currentTarget);
        sourceStatus.textContent = "链接处理中…";
        try {
          await HallOfFameClient.requestJson("/v1/personae/" + personaId + "/sources/url", {
            method: "POST",
            body: JSON.stringify({
              url: String(form.get("url") || ""),
              title: String(form.get("title") || ""),
              sourceKind: String(form.get("sourceKind") || "PRIMARY"),
            }),
          });
          sourceStatus.textContent = "已添加，可用于预览。";
          event.currentTarget.reset();
          await refreshSources();
        } catch (error) {
          sourceStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      document.querySelector("[data-open-preview]")?.addEventListener("click", async () => {
        if (!personaId) {
          sourceStatus.textContent = "请先创建对象。";
          return;
        }
        sourceStatus.textContent = "生成中…";
        try {
          const version = await HallOfFameClient.requestJson("/v1/personae/" + personaId + "/distill", {
            method: "POST",
          });
          window.location.href = "/preview/" + version.id;
        } catch (error) {
          sourceStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      void HallOfFameClient.ensureAnonymousSession().then(loadManagedPersona);
    `,
  });

const renderPreviewPage = async (personaVersionId: string) =>
  renderShell({
    title: "预览",
    body: `
      <div class="page-stage">
        ${renderPageHeader({
          eyebrow: "Preview",
          title: "先听它怎么开口",
          subtitle: "先预览，确认后再发布。",
          extra: '<a class="mini-link" href="/create">返回创建</a>',
        })}
        <div class="stage-strip" aria-label="创建阶段">
          <span class="stage-pill is-done">对象定义</span>
          <span class="stage-pill is-done">资料管理</span>
          <span class="stage-pill is-active">预览</span>
          <span class="stage-pill">发布</span>
        </div>
        <div class="stage-grid">
          <section class="thread-screen">
            <header class="thread-header">
              <div class="thread-header-copy">
                <h2 class="thread-name" data-thread-name>预览聊天</h2>
                <p class="thread-status" data-thread-status>先试聊，再决定是私用还是公开分享。</p>
              </div>
              <div class="thread-typing" data-thread-typing aria-label="正在输入中"></div>
            </header>
            <div class="message-list" data-chat-log data-chat-assistant-name="预览对象">
              ${renderStaticBubble({
                role: "assistant",
                label: "预览对象",
                content: "不够像，就先别发布。",
              })}
            </div>
            <section class="composer-shell">
              <form data-chat-form class="composer">
                <textarea placeholder="输入一个问题"></textarea>
                <div class="composer-actions">
                  <button type="submit">发送</button>
                </div>
              </form>
              <div class="status-line" data-chat-status></div>
            </section>
          </section>

          <div class="list-stack">
            <section class="stage-card">
              <div class="mini-eyebrow">当前状态</div>
              <h3 class="card-title">预览简介</h3>
              <div class="body-copy" data-version-summary>加载中...</div>
            </section>
            <section class="stage-card">
              <div class="mini-eyebrow">推荐问题</div>
              <ul class="question-list" data-preview-questions><li class="empty-state">加载中...</li></ul>
            </section>
            <section class="stage-card">
              <div class="mini-eyebrow">示例回答</div>
              <ul class="question-list" data-preview-answers><li class="empty-state">加载中...</li></ul>
            </section>
            <section class="stage-card">
              <div class="mini-eyebrow">使用方式</div>
              <h3 class="card-title">确认后再决定</h3>
              <p class="body-copy">可以先仅自己使用，也可以直接公开分享。</p>
              <div class="actions">
                <button type="button" data-publish-private>仅自己使用</button>
                <button type="button" class="secondary" data-publish-public>公开分享</button>
              </div>
              <div class="status-line" data-preview-status></div>
              <div class="list-stack" data-preview-result></div>
            </section>
          </div>
        </div>
        ${renderBottomShuttle("create")}
      </div>
    `,
    script: `
      const versionId = ${JSON.stringify(personaVersionId)};
      const summarySlot = document.querySelector("[data-version-summary]");
      const questionsSlot = document.querySelector("[data-preview-questions]");
      const answersSlot = document.querySelector("[data-preview-answers]");
      const previewStatus = document.querySelector("[data-preview-status]");
      const previewResult = document.querySelector("[data-preview-result]");

      const loadVersion = async () => {
        await HallOfFameClient.ensureAnonymousSession();
        try {
          const version = await HallOfFameClient.requestJson("/v1/persona-versions/" + versionId, {
            method: "GET",
          });
          summarySlot.textContent = version.previewIntro || ("当前状态：" + version.status);
          questionsSlot.innerHTML = version.recommendedQuestions.length
            ? version.recommendedQuestions.map((item) => "<li class='question-slip'>" + HallOfFameClient.escapeHtml(item) + "</li>").join("")
            : "<li class='empty-state'>暂无推荐问题</li>";
          answersSlot.innerHTML = version.sampleAnswers.length
            ? version.sampleAnswers.map((item) => "<li class='answer-note'>" + HallOfFameClient.escapeHtml(item) + "</li>").join("")
            : "<li class='empty-state'>暂无示例回答</li>";
        } catch (error) {
          summarySlot.textContent = error instanceof Error ? error.message : String(error);
        }
      };

      const renderPublishResult = (result) => {
        if (!previewResult) return;

        if (result.share) {
          previewResult.innerHTML =
            "<a class='utility-link' href='/share/" +
            encodeURIComponent(result.share.shareSlug) +
            "'>查看分享页</a>" +
            "<a class='utility-link secondary' href='/profile'>回到我的</a>" +
            "<div class='meta'>" +
            HallOfFameClient.escapeHtml(result.share.canonicalUrl) +
            "</div>";
          return;
        }

        previewResult.innerHTML =
          "<a class='utility-link' href='/profile'>回到我的</a>" +
          "<a class='utility-link secondary' href='/create'>继续编辑</a>";
      };

      const publishVersion = async (visibility) => {
        previewStatus.textContent = visibility === "PUBLIC" ? "发布中…" : "保存中…";
        if (previewResult) {
          previewResult.innerHTML = "";
        }
        try {
          const result = await HallOfFameClient.requestJson("/v1/persona-versions/" + versionId + "/publish", {
            method: "POST",
            body: JSON.stringify({ visibility }),
          });
          previewStatus.textContent = visibility === "PUBLIC" ? "已公开分享。" : "已保存为仅自己使用。";
          renderPublishResult(result);
        } catch (error) {
          previewStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      };

      document.querySelector("[data-publish-private]")?.addEventListener("click", async () => {
        await publishVersion("PRIVATE");
      });

      document.querySelector("[data-publish-public]")?.addEventListener("click", async () => {
        await publishVersion("PUBLIC");
      });

      void loadVersion();
    ` + renderChatScript({
      targetType: "draft_version_preview",
      targetValue: personaVersionId,
      assistantName: "预览对象",
    }),
  });

const renderProfilePage = () =>
  renderShell({
    title: "我的",
    body: buildProfilePageBody(),
    script: `
      const draftCountSlot = document.querySelector("[data-profile-draft-count]");
      const publishedCountSlot = document.querySelector("[data-profile-published-count]");
      const sessionCopySlot = document.querySelector("[data-profile-session-copy]");
      const personaListSlot = document.querySelector("[data-profile-persona-list]");
      let personae = [];

      const renderPersonaList = (items) => {
        if (!personaListSlot) return;

        if (!items.length) {
          personaListSlot.innerHTML = "<div class='empty-state'>还没有对象，先去创建一个。</div>";
          return;
        }

        personaListSlot.innerHTML = items
          .map((item) => {
            const statusCopy = item.status === "PUBLISHED" ? "已公开" : item.listingStatus === "PRIVATE" ? "仅自己使用" : "继续编辑中";
            const tags = (item.distillFocus || []).length
              ? "<div class='pill-row'>" + item.distillFocus
                  .map((tag) => "<span class='mini-tag'>" + HallOfFameClient.escapeHtml(tag) + "</span>")
                  .join("") + "</div>"
              : "";
            const primaryAction =
              "<a class='utility-link' href='/create?personaId=" +
              encodeURIComponent(item.personaId) +
              "' data-profile-edit='" +
              HallOfFameClient.escapeHtml(item.personaId) +
              "'>继续编辑</a>";
            const shareAction = item.primaryShareSlug
              ? "<a class='utility-link secondary' href='/share/" +
                encodeURIComponent(item.primaryShareSlug) +
                "'>查看分享</a>"
              : "";

            return (
              "<section class='summary-card'>" +
              "<div class='mini-eyebrow'>" +
              HallOfFameClient.escapeHtml(statusCopy) +
              "</div>" +
              "<strong>" +
              HallOfFameClient.escapeHtml(item.displayName) +
              "</strong>" +
              "<p class='summary-copy'>" +
              HallOfFameClient.escapeHtml(item.positioning || item.previewIntro || "继续补资料后再预览。") +
              "</p>" +
              tags +
              "<div class='actions'>" +
              primaryAction +
              shareAction +
              "</div>" +
              "</section>"
            );
          })
          .join("");
      };

      const loadProfile = async () => {
        await HallOfFameClient.ensureAnonymousSession();
        const session = HallOfFameClient.readSession();
        if (sessionCopySlot) {
          sessionCopySlot.textContent =
            session?.role === "REVIEWER"
              ? "已登录"
              : session?.role === "USER"
                ? "已登录"
              : "匿名体验";
        }

        try {
          const dashboard = await HallOfFameClient.requestJson("/v1/me/personae", {
            method: "GET",
          });
          personae = dashboard.items || [];
          if (draftCountSlot) draftCountSlot.textContent = String(dashboard.stats?.draftCount ?? 0);
          if (publishedCountSlot) publishedCountSlot.textContent = String(dashboard.stats?.publishedCount ?? 0);
          renderPersonaList(personae);
        } catch (error) {
          if (draftCountSlot) draftCountSlot.textContent = "0";
          if (publishedCountSlot) publishedCountSlot.textContent = "0";
          if (personaListSlot) {
            personaListSlot.innerHTML = "<div class='empty-state'>" + HallOfFameClient.escapeHtml(error instanceof Error ? error.message : String(error)) + "</div>";
          }
        }
      };

      personaListSlot?.addEventListener("click", (event) => {
        const editLink = event.target.closest("[data-profile-edit]");
        if (!editLink) {
          return;
        }

        const persona = personae.find((item) => item.personaId === editLink.getAttribute("data-profile-edit"));
        if (!persona) {
          return;
        }

        HallOfFameClient.writeCurrentPersonaSelection({
          id: persona.personaId,
          displayName: persona.displayName,
          positioning: persona.positioning || persona.previewIntro || "",
          tags: persona.distillFocus || [],
        });
      });

      void loadProfile();
    `,
  });

const renderReviewPage = () =>
  renderShell({
    title: "审核入口",
    body: buildReviewPageBody(),
    script: `
      const reviewerStatus = document.querySelector("[data-reviewer-status]");
      const sourceList = document.querySelector("[data-source-review-list]");
      const versionList = document.querySelector("[data-version-review-list]");

      const loadQueues = async () => {
        const session = HallOfFameClient.readSession();
        if (!session || session.role !== "REVIEWER") {
          reviewerStatus.textContent = "当前不是 reviewer。";
          sourceList.innerHTML = "<li class='empty-state'>请先登录 reviewer</li>";
          versionList.innerHTML = "<li class='empty-state'>请先登录 reviewer</li>";
          return;
        }

        reviewerStatus.textContent = "已进入 reviewer 身份。";
        const [sourceQueue, versionQueue] = await Promise.all([
          HallOfFameClient.requestJson("/v1/reviews/sources"),
          HallOfFameClient.requestJson("/v1/reviews/persona-versions"),
        ]);

        sourceList.innerHTML = (sourceQueue.items || []).length
          ? sourceQueue.items
              .map(
                (item) =>
                  "<li class='queue-item'><strong>" +
                  HallOfFameClient.escapeHtml(item.sourceTitle || item.sourceId) +
                  "</strong><div class='meta'>" +
                  HallOfFameClient.escapeHtml(item.displayName + " / " + item.sourceKind) +
                  "</div><p class='body-copy'>" +
                  HallOfFameClient.escapeHtml(item.sourceSummary || "") +
                  "</p><div class='actions'><button class='ok' data-source-approve='" +
                  item.sourceId +
                  "'>通过</button><button class='danger' data-source-reject='" +
                  item.sourceId +
                  "'>拒绝</button></div></li>",
              )
              .join("")
          : "<li class='empty-state'>当前没有待审资料</li>";

        versionList.innerHTML = (versionQueue.items || []).length
          ? versionQueue.items
              .map(
                (item) =>
                  "<li class='queue-item'><strong>" +
                  HallOfFameClient.escapeHtml(item.displayName + " v" + item.versionNumber) +
                  "</strong><div class='meta'>" +
                  HallOfFameClient.escapeHtml(item.previewIntro || "") +
                  "</div><div class='meta'>coverage " +
                  item.coverageScore +
                  " / grounding " +
                  item.groundingScore +
                  " / risk " +
                  item.riskScore +
                  "</div><div class='actions'><button class='ok' data-version-approve='" +
                  item.personaVersionId +
                  "'>发布</button><button class='danger' data-version-reject='" +
                  item.personaVersionId +
                  "'>驳回</button></div></li>",
              )
              .join("")
          : "<li class='empty-state'>当前没有待审发布请求</li>";
      };

      document.querySelector("[data-reviewer-login]")?.addEventListener("click", async () => {
        reviewerStatus.textContent = "登录 reviewer...";
        try {
          const session = await HallOfFameClient.requestJson("/v1/auth/dev/reviewer", {
            method: "POST",
            body: JSON.stringify({}),
          });
          HallOfFameClient.writeSession(session);
          await loadQueues();
        } catch (error) {
          reviewerStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      document.querySelector("[data-clear-session]")?.addEventListener("click", () => {
        HallOfFameClient.clearSession();
        void loadQueues();
      });

      document.addEventListener("click", async (event) => {
        const approveSource = event.target.closest("[data-source-approve]");
        const rejectSource = event.target.closest("[data-source-reject]");
        const approveVersion = event.target.closest("[data-version-approve]");
        const rejectVersion = event.target.closest("[data-version-reject]");

        try {
          if (approveSource) {
            await HallOfFameClient.requestJson("/v1/reviews/sources/" + approveSource.getAttribute("data-source-approve") + "/approve", {
              method: "POST",
              body: JSON.stringify({ reason: "Approved in H5 review console" }),
            });
            await loadQueues();
          }
          if (rejectSource) {
            await HallOfFameClient.requestJson("/v1/reviews/sources/" + rejectSource.getAttribute("data-source-reject") + "/reject", {
              method: "POST",
              body: JSON.stringify({ reason: "Rejected in H5 review console" }),
            });
            await loadQueues();
          }
          if (approveVersion) {
            const result = await HallOfFameClient.requestJson("/v1/reviews/persona-versions/" + approveVersion.getAttribute("data-version-approve") + "/approve-publish", {
              method: "POST",
              body: JSON.stringify({ reason: "Approved in H5 review console" }),
            });
            reviewerStatus.textContent = result.share ? "已发布并生成分享：" + result.share.canonicalUrl : "已发布";
            await loadQueues();
          }
          if (rejectVersion) {
            await HallOfFameClient.requestJson("/v1/reviews/persona-versions/" + rejectVersion.getAttribute("data-version-reject") + "/reject-publish", {
              method: "POST",
              body: JSON.stringify({ reason: "Rejected in H5 review console" }),
            });
            await loadQueues();
          }
        } catch (error) {
          reviewerStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      void loadQueues();
    `,
  });

const sendHtml = (reply: FastifyReply, html: string) => reply.type("text/html; charset=utf-8").send(html);

export const buildH5Server = () => {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    ok: true,
    service: "hall-of-fame-h5",
  }));

  app.get("/", async (_request, reply) => sendHtml(reply, await renderFeaturedList()));
  app.get("/history", async (_request, reply) => sendHtml(reply, await renderHistoryPage()));
  app.get<{ Params: { personaId: string }; Querystring: { chatId?: string; from?: string } }>(
    "/persona/:personaId",
    async (request, reply) => sendHtml(reply, await renderPersonaPage(request.params.personaId, request.query)),
  );
  app.get<{ Params: { shareSlug: string } }>("/share/:shareSlug", async (request, reply) =>
    sendHtml(reply, await renderSharePage(request.params.shareSlug)),
  );
  app.get("/create", async (_request, reply) => sendHtml(reply, renderCreatePage()));
  app.get<{ Params: { personaVersionId: string } }>("/preview/:personaVersionId", async (request, reply) =>
    sendHtml(reply, await renderPreviewPage(request.params.personaVersionId)),
  );
  app.get("/profile", async (_request, reply) => sendHtml(reply, renderProfilePage()));

  return app;
};

export { buildReplyInspectorHtml };
