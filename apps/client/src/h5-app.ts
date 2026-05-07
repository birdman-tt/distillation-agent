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

  .debug-json {
    max-height: 220px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    padding: 12px;
    border-radius: 16px;
    border: 1px solid var(--line);
    background: rgba(0, 0, 0, 0.18);
    color: var(--ink-soft);
    font-size: 12px;
    line-height: 1.5;
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

    if (item.ownedObjectId) {
      return appendHistorySource("/profile/objects/" + encodeURIComponent(item.ownedObjectId) + "/chat");
    }
    if (item.targetType === "published_persona" && item.resumePersonaId) {
      return appendHistorySource("/persona/" + encodeURIComponent(item.resumePersonaId));
    }
    if (item.targetType === "draft_version_preview") {
      return "/history/" + encodeURIComponent(item.id);
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
      title: "蒸馏一个对象",
      subtitle: "输入名字，先确认资料，再生成候选。",
    })}

    <section class="shell-panel" data-create-light-start>
      <div class="mini-eyebrow">对象</div>
      <h2 class="section-title">你想和谁聊天</h2>
      <p class="body-copy">真实人物或虚拟角色都可以。系统会先做风险判断，再找可用资料。</p>
      <form data-create-form class="field-stack">
        <label class="field-block">
          <span class="field-label">对象名称</span>
          <input name="query" placeholder="例如：王阳明、庆帝、芙莉莲" />
        </label>
        <div class="field-block">
          <span class="field-label">更想像哪一面</span>
          <div class="tag-row">
            <button type="button" class="tag-chip is-active" data-tag-value="说话方式">说话方式</button>
            <button type="button" class="tag-chip is-active" data-tag-value="思考方式">思考方式</button>
            <button type="button" class="tag-chip" data-tag-value="价值判断">价值判断</button>
            <button type="button" class="tag-chip" data-tag-value="情绪反应">情绪反应</button>
            <button type="button" class="tag-chip" data-tag-value="关键经历">关键经历</button>
            <button type="button" class="tag-chip" data-tag-value="边界禁区">边界禁区</button>
          </div>
          <input name="customTags" placeholder="也可以补充关注点，逗号分隔" />
        </div>
        <div class="actions">
          <button type="submit">搜索资料</button>
        </div>
      </form>
      <div class="status-line" data-create-status></div>
      <div class="actions source-discovery-actions" data-source-discovery-actions></div>
    </section>

    <section class="shell-panel" data-create-success hidden>
      <div class="mini-eyebrow">资料确认</div>
      <h2 class="section-title" data-created-name>资料找到了</h2>
      <p class="body-copy">默认会选中推荐资料。你可以取消，也可以自己补充资料。</p>
      <div class="summary-card">
        <strong data-discovery-name>待确认对象</strong>
        <p class="summary-copy" data-discovery-risk>风险判断中</p>
      </div>
      <div class="stage-grid">
        <section class="stage-card is-active">
          <div class="mini-eyebrow">系统资料</div>
          <h2 class="section-title">确认资料来源</h2>
          <p class="body-copy">这些资料会进入蒸馏流程，用来提取说话习惯、思维方式和边界。</p>
          <ul class="source-list" data-discovery-source-list><li class="empty-state">加载中...</li></ul>
        </section>

        <section class="stage-card">
          <div class="mini-eyebrow">补充资料</div>
          <h2 class="section-title">你也可以加资料</h2>
          <p class="body-copy">最好补原文、访谈、设定集或片段，不要只写主观评价。</p>
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
              <button type="submit">添加资料</button>
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
              <button type="submit" class="secondary">添加链接</button>
            </div>
          </form>

          <div class="status-line" data-source-status></div>
          <ul class="source-list" data-extra-source-list><li class="empty-state">还没有补充资料</li></ul>
        </section>

        <div class="list-stack">
          <section class="stage-card">
            <div class="mini-eyebrow">详情</div>
            <h3 class="card-title">生成候选对象</h3>
            <p class="body-copy">蒸馏完成后会进入对象详情，确认后再保存或公开。</p>
            <div class="actions">
              <button type="button" data-start-distill>开始蒸馏</button>
            </div>
          </section>

          <section class="stage-card">
            <div class="mini-eyebrow">使用方式</div>
            <h3 class="card-title">确认后再使用</h3>
            <p class="body-copy">候选会先出现在我的对象，不会自动公开。</p>
          </section>
        </div>
      </div>
    </section>

    <section class="workbench-shell" data-create-workbench hidden>
      <div class="stage-strip" aria-label="创建阶段">
        <span class="stage-pill is-done">对象识别</span>
        <span class="stage-pill is-done">资料确认</span>
        <span class="stage-pill is-active">蒸馏中</span>
        <span class="stage-pill">详情</span>
      </div>
      <section class="summary-card">
        <div class="mini-eyebrow">任务</div>
        <h2 class="section-title" data-job-title>正在蒸馏</h2>
        <p class="summary-copy" data-job-status>准备资料</p>
      </section>
      <section class="stage-card">
        <div class="mini-eyebrow">进度</div>
        <h3 class="card-title" data-job-progress>0%</h3>
        <p class="body-copy">完成后会自动进入对象详情。如果离开页面，可以在我的对象里继续查看。</p>
        <div class="actions">
          <a class="utility-link secondary" href="/profile/objects">去我的对象</a>
        </div>
      </section>
      <section class="stage-card" data-distill-debug-panel hidden>
        <div class="mini-eyebrow">调试日志</div>
        <h3 class="card-title">蒸馏流程</h3>
        <p class="body-copy">仅调试模式显示，用来排查每一步输入、输出和工具调用。</p>
        <ul class="source-list" data-distill-debug-list>
          <li class="empty-state">暂无日志</li>
        </ul>
      </section>
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
      subtitle: "对象、聊天和创建入口。",
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

    <section class="profile-card">
      <div class="list-stack">
        <a class="utility-link" href="/profile/objects">我的对象</a>
        <a class="utility-link secondary" href="/history">聊天列表</a>
        <a class="utility-link secondary" href="/create">创建对象</a>
      </div>
    </section>

    ${renderBottomShuttle("profile")}
  </div>
`;

export const buildMyObjectsPageBody = () => `
  <div class="page-stage history-stage">
    ${renderPageHeader({
      eyebrow: "Objects",
      title: "我的对象",
      subtitle: "进入对象详情后再管理。",
      extra: '<a class="mini-link" href="/profile">返回我的</a>',
    })}
    <section class="history-section">
      <ul class="history-list" data-my-objects-list>
        <li class="empty-state">加载中...</li>
      </ul>
    </section>
    ${renderBottomShuttle("profile")}
  </div>
`;

export const buildMyObjectDetailPageBody = (objectId: string) => `
  <div class="page-stage" data-my-object-detail data-object-id="${escapeHtml(objectId)}">
    ${renderPageHeader({
      eyebrow: "Object",
      title: "对象详情",
      subtitle: "管理放在这里，聊天保持干净。",
      titleAttrs: "data-my-object-title",
      subtitleAttrs: "data-my-object-subtitle",
      extra: '<a class="mini-link" href="/profile/objects">返回列表</a>',
    })}

    <section class="profile-card">
      <div class="mini-eyebrow" data-my-object-status>加载中</div>
      <h2 class="section-title" data-my-object-name>对象</h2>
      <p class="body-copy" data-my-object-intro>正在加载...</p>
      <div class="status-line" data-my-object-message></div>
    </section>

    <section class="profile-card">
      <div class="mini-eyebrow">操作</div>
      <div class="actions" data-my-object-actions></div>
      <div class="status-line" data-my-object-action-status></div>
    </section>

    <section class="profile-card" data-my-object-edit-panel hidden>
      <div class="mini-eyebrow">编辑</div>
      <form class="field-stack" data-my-object-edit-form>
        <label class="field-block">
          <span class="field-label">名称</span>
          <input name="displayName" maxlength="40" required />
        </label>
        <label class="field-block">
          <span class="field-label">简介</span>
          <textarea name="intro" maxlength="120"></textarea>
        </label>
        <div class="actions">
          <button type="submit">保存</button>
          <button type="button" class="secondary" data-my-object-edit-cancel>取消</button>
        </div>
      </form>
    </section>

    ${renderBottomShuttle("profile")}
  </div>
`;

export const buildMyObjectChatPageBody = (objectId: string) => `
  <div class="page-stage chat-stage chat-focused" data-my-object-chat data-object-id="${escapeHtml(objectId)}">
    ${renderPageHeader({
      eyebrow: "聊天",
      title: "对象",
      subtitle: "等你开口",
      titleAttrs: "data-thread-name",
      subtitleAttrs: "data-thread-status",
      subtitleClass: "thread-status",
      extra: `<div class="thread-typing" data-thread-typing aria-label="正在输入中"></div><a class="mini-link" href="/profile/objects/${escapeHtml(objectId)}">返回</a>`,
    })}
    <section class="thread-screen">
      <div class="message-list" data-chat-log data-chat-assistant-name="对象">
        ${renderStaticBubble({
          role: "assistant",
          label: "对象",
          content: "想聊什么？",
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

export const buildReadOnlyHistoryChatPageBody = (chatId: string) => `
  <div class="page-stage chat-stage chat-focused" data-history-chat data-chat-id="${escapeHtml(chatId)}">
    ${renderPageHeader({
      eyebrow: "记录",
      title: "聊天记录",
      subtitle: "旧会话只能查看。",
      titleAttrs: "data-thread-name",
      subtitleAttrs: "data-thread-status",
      subtitleClass: "thread-status",
      extra: '<a class="mini-link" href="/history">返回列表</a>',
    })}
    <section class="thread-screen">
      <div class="message-list" data-chat-log data-chat-assistant-name="对象">
        ${renderStaticBubble({
          role: "assistant",
          label: "对象",
          content: "正在加载记录。",
        })}
      </div>
      <div class="status-line" data-chat-status>旧会话只保留记录，不能继续发送。</div>
    </section>
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

const renderReadOnlyHistoryChatPage = (chatId: string) =>
  renderShell({
    title: "聊天记录",
    body: buildReadOnlyHistoryChatPageBody(chatId),
    script: renderChatScript({
      targetType: "history_chat",
      assistantName: "对象",
      initialChatId: chatId,
    }),
  });

type ChatScriptInput =
  | {
      targetType: "published_persona" | "draft_version_preview" | "share_link";
      targetValue: string;
      assistantName?: string;
      initialChatId?: string | null;
    }
  | {
      targetType: "history_chat";
      assistantName?: string;
      initialChatId: string;
    }
  | {
      targetType: "owned_object";
      objectId: string;
      assistantName?: string;
      initialChatId?: string | null;
    };

const renderChatScript = (input: ChatScriptInput) => {
  const createChatSessionExpression = (() => {
    if (input.targetType === "owned_object") {
      return `HallOfFameClient.requestJson("/v1/me/objects/" + encodeURIComponent(${JSON.stringify(input.objectId)}) + "/chats", {
          method: "POST",
        }).then((created) => created.chatId)`;
    }
    if (input.targetType === "history_chat") {
      return `Promise.reject(new Error("旧会话不能继续发送。"))`;
    }

    const payload =
      input.targetType === "published_persona"
        ? `{ targetType: "published_persona", personaId: "${input.targetValue}" }`
        : input.targetType === "draft_version_preview"
          ? `{ targetType: "draft_version_preview", personaVersionId: "${input.targetValue}" }`
          : `{ targetType: "share_link", shareSlug: "${input.targetValue}" }`;

    return `(() => {
          const payload = ${payload};
          return HallOfFameClient.requestJson("/v1/chats", {
            method: "POST",
            body: JSON.stringify(payload),
          }).then((created) => created.id);
        })()`;
  })();

  return `
  const form = document.querySelector("[data-chat-form]");
  const log = document.querySelector("[data-chat-log]");
  const status = document.querySelector("[data-chat-status]");
  const threadTyping = document.querySelector("[data-thread-typing]");
  const initialChatId = ${JSON.stringify(input.initialChatId ?? null)};
  let chatId = initialChatId;
  let chatCreation = null;
  let pendingAssistantReplies = 0;
  const assistantReplyWaitTimers = [];
  const getAssistantName = () =>
    ${JSON.stringify(input.assistantName ?? null)}
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
    if (pendingAssistantReplies > 0) {
      threadTyping.classList.add("is-visible");
      threadTyping.replaceChildren(buildTypingIndicator());
      return;
    }

    threadTyping.classList.remove("is-visible");
    threadTyping.replaceChildren();
  };

  const beginAssistantReplyWait = () => {
    pendingAssistantReplies += 1;
    syncThreadTyping();
    const timer = window.setTimeout(() => {
      endAssistantReplyWait();
    }, 45000);
    assistantReplyWaitTimers.push(timer);
  };

  const endAssistantReplyWait = () => {
    if (pendingAssistantReplies <= 0) {
      return;
    }
    pendingAssistantReplies -= 1;
    const timer = assistantReplyWaitTimers.shift();
    if (timer) {
      window.clearTimeout(timer);
    }
    syncThreadTyping();
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
      label.textContent = getAssistantName();
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
          if (payload.type === "chat.turn.completed") {
            endAssistantReplyWait();
          }
          if (payload.type === "chat.turn.failed") {
            endAssistantReplyWait();
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

    chatCreation = ${createChatSessionExpression}
      .then((createdId) => {
        chatId = createdId;
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
        beginAssistantReplyWait();
        return;
      }
      appendMessageIfMissing(reply, "auto");
    } catch (error) {
      setUserBubbleFailed(bubble, failureLabel);
      setStatus(error instanceof Error ? error.message : String(error));
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
};

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
      const sourceDiscoveryActions = document.querySelector("[data-source-discovery-actions]");
      const createForm = document.querySelector("[data-create-form]");
      const createSubmitButton = createForm?.querySelector("button[type='submit']");
      const sourceStatus = document.querySelector("[data-source-status]");
      const lightStartShell = document.querySelector("[data-create-light-start]");
      const successShell = document.querySelector("[data-create-success]");
      const workbenchShell = document.querySelector("[data-create-workbench]");
      const createdNameSlot = document.querySelector("[data-created-name]");
      const discoveryNameSlot = document.querySelector("[data-discovery-name]");
      const discoveryRiskSlot = document.querySelector("[data-discovery-risk]");
      const discoverySourceList = document.querySelector("[data-discovery-source-list]");
      const extraSourceList = document.querySelector("[data-extra-source-list]");
      const jobTitleSlot = document.querySelector("[data-job-title]");
      const jobStatusSlot = document.querySelector("[data-job-status]");
      const jobProgressSlot = document.querySelector("[data-job-progress]");
      const distillDebugPanel = document.querySelector("[data-distill-debug-panel]");
      const distillDebugList = document.querySelector("[data-distill-debug-list]");
      const tagButtons = Array.from(document.querySelectorAll("[data-tag-value]"));
      const createParams = new URLSearchParams(window.location.search);
      const initialJobId = createParams.get("jobId");
      const initialSourceDiscoveryJobId = createParams.get("sourceDiscoveryJobId");
      const shouldAddSources = createParams.get("mode") === "addSources";
      const DISTILL_DEBUG_KEY = "hof-distill-debug";
      let intentId = null;
      let discoveryId = null;
      let jobId = initialJobId || null;
      let sourceDiscoveryJobId = initialSourceDiscoveryJobId || null;
      let normalizedName = "";
      let sourceCandidates = [];
      let extraSources = [];
      let selectedSourceCandidateIdsFromJob = [];
      let pollTimer = null;
      let sourceDiscoveryPollTimer = null;
      let isSourceDiscoverySubmitting = false;
      let personaId = null;

      const shouldShowDistillDebug = () => {
        try {
          return createParams.get("debug") === "distill" || window.localStorage.getItem(DISTILL_DEBUG_KEY) === "true";
        } catch {
          return createParams.get("debug") === "distill";
        }
      };

      const buildCreateUrl = () => (shouldShowDistillDebug() ? "/create?debug=distill" : "/create");
      const buildCreateJobUrl = (nextJobId) =>
        "/create?jobId=" + encodeURIComponent(nextJobId) + (shouldShowDistillDebug() ? "&debug=distill" : "");
      const buildCreateSourceDiscoveryJobUrl = (nextSourceDiscoveryJobId) =>
        "/create?sourceDiscoveryJobId=" +
        encodeURIComponent(nextSourceDiscoveryJobId) +
        (shouldShowDistillDebug() ? "&debug=distill" : "");

      if (distillDebugPanel) {
        distillDebugPanel.hidden = !shouldShowDistillDebug();
      }

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

      const showState = (state) => {
        if (lightStartShell) lightStartShell.hidden = state !== "light-start";
        if (successShell) successShell.hidden = state !== "success";
        if (workbenchShell) workbenchShell.hidden = state !== "workbench";
      };

      const renderDiscoverySources = () => {
        if (!discoverySourceList) return;
        if (!sourceCandidates.length) {
          discoverySourceList.innerHTML = "<li class='empty-state'>没有找到可用资料。可以先补充资料。</li>";
          return;
        }

        discoverySourceList.innerHTML = sourceCandidates
          .map((item) => {
            const checked =
              (selectedSourceCandidateIdsFromJob.length
                ? selectedSourceCandidateIdsFromJob.includes(item.sourceCandidateId)
                : item.recommended && (!Array.isArray(item.riskFlags) || item.riskFlags.length === 0))
                ? "checked"
                : "";
            const riskCopy = Array.isArray(item.riskFlags) && item.riskFlags.length
              ? "<div class='meta'>风险：" + HallOfFameClient.escapeHtml(item.riskFlags.join("、")) + "</div>"
              : "";
            return (
              "<li class='source-item'>" +
              "<label class='check-row'>" +
              "<input type='checkbox' data-source-candidate='" +
              HallOfFameClient.escapeHtml(item.sourceCandidateId) +
              "' " +
              checked +
              " />" +
              "<span><strong>" +
              HallOfFameClient.escapeHtml(item.title) +
              "</strong><div class='meta'>" +
              HallOfFameClient.escapeHtml(item.bucket + " / " + item.sourceKind + " / " + item.trustLevel) +
              "</div><p class='body-copy'>" +
              HallOfFameClient.escapeHtml(item.snippet || "") +
              "</p>" +
              riskCopy +
              "</span></label></li>"
            );
          })
          .join("");
      };

      const renderExtraSources = () => {
        if (!extraSourceList) return;
        if (!extraSources.length) {
          extraSourceList.innerHTML = "<li class='empty-state'>还没有补充资料</li>";
          return;
        }

        extraSourceList.innerHTML = extraSources
          .map((item) => {
            const statusCopy = item.status === "USABLE" ? "可用" : item.status === "REJECTED" ? "已拒绝" : "处理中";
            return (
              "<li class='source-item'><strong>" +
              HallOfFameClient.escapeHtml(item.title) +
              "</strong><div class='meta'>" +
              HallOfFameClient.escapeHtml(statusCopy + " / " + item.sourceKind) +
              "</div><p class='body-copy'>" +
              HallOfFameClient.escapeHtml(item.snippet || item.rejectionReason || "") +
              "</p></li>"
            );
          })
          .join("");
      };

      const collectSelectedSourceIds = () =>
        Array.from(document.querySelectorAll("[data-source-candidate]:checked"))
          .map((input) => input.getAttribute("data-source-candidate") || "")
          .filter(Boolean);

      const collectSelectedExtraSourceIds = () =>
        extraSources
          .filter((item) => item.status === "USABLE")
          .map((item) => item.extraSourceId)
          .filter(Boolean);

      const renderDiscovery = (discovery) => {
        discoveryId = discovery.discoveryId;
        sourceCandidates = discovery.sourceCandidates || [];
        if (createdNameSlot) createdNameSlot.textContent = discovery.normalizedName;
        if (discoveryNameSlot) discoveryNameSlot.textContent = discovery.normalizedName;
        if (discoveryRiskSlot) {
          discoveryRiskSlot.textContent =
            discovery.riskDecision === "ALLOW"
              ? "可蒸馏，已找到 " + sourceCandidates.length + " 条资料"
              : "需要确认：" + discovery.riskDecision;
        }
        renderDiscoverySources();
        renderExtraSources();
      };

      const setCreateSubmitDisabled = (isDisabled) => {
        if (createSubmitButton) {
          createSubmitButton.disabled = isDisabled;
          createSubmitButton.textContent = isDisabled ? "搜索中" : "搜索资料";
        }
      };

      const clearSourceDiscoveryActions = () => {
        if (sourceDiscoveryActions) {
          sourceDiscoveryActions.innerHTML = "";
        }
      };

      const renderSourceDiscoveryRetryAction = () => {
        if (!sourceDiscoveryActions) return;
        sourceDiscoveryActions.innerHTML =
          "<button type='button' class='secondary' data-retry-source-discovery>重试搜索</button>";
      };

      const renderSourceDiscoveryJob = (job) => {
        if (!job) return;
        intentId = job.intentId || intentId;

        if (job.status === "SUCCEEDED") {
          setCreateSubmitDisabled(false);
          clearSourceDiscoveryActions();
          if (createStatus) createStatus.textContent = "";
          return;
        }

        if (job.status === "FAILED" || job.status === "BLOCKED") {
          setCreateSubmitDisabled(false);
          if (createStatus) {
            createStatus.textContent = job.error?.message || "资料搜索失败，可以重试。";
          }
          if (job.status === "FAILED" && job.error?.retryable) {
            renderSourceDiscoveryRetryAction();
          } else {
            clearSourceDiscoveryActions();
          }
          return;
        }

        setCreateSubmitDisabled(true);
        clearSourceDiscoveryActions();
        if (createStatus) {
          createStatus.textContent = job.currentStep || "正在搜索资料…";
        }
      };

      const loadSourceDiscoveryJob = async () => {
        if (!sourceDiscoveryJobId) return null;
        return HallOfFameClient.requestJson(
          "/v1/persona-distill-source-discovery-jobs/" + encodeURIComponent(sourceDiscoveryJobId),
          {
            method: "GET",
          },
        );
      };

      const stopSourceDiscoveryPolling = () => {
        if (sourceDiscoveryPollTimer) {
          window.clearTimeout(sourceDiscoveryPollTimer);
          sourceDiscoveryPollTimer = null;
        }
      };

      const pollSourceDiscoveryJob = async () => {
        if (!sourceDiscoveryJobId) return;
        try {
          const job = await loadSourceDiscoveryJob();
          renderSourceDiscoveryJob(job);
          if (job?.status === "SUCCEEDED") {
            stopSourceDiscoveryPolling();
            if (job.discovery) {
              renderDiscovery(job.discovery);
              showState("success");
              window.history.replaceState({}, "", buildCreateSourceDiscoveryJobUrl(sourceDiscoveryJobId));
            } else if (createStatus) {
              createStatus.textContent = "资料已找到，但结果为空，请重试。";
              renderSourceDiscoveryRetryAction();
            }
            return;
          }
          if (job?.status === "FAILED" || job?.status === "BLOCKED") {
            stopSourceDiscoveryPolling();
            showState("light-start");
            return;
          }
          sourceDiscoveryPollTimer = window.setTimeout(pollSourceDiscoveryJob, 1500);
        } catch (error) {
          if (createStatus) {
            console.warn("source discovery poll failed", error);
            createStatus.textContent = "资料搜索暂时不可用，正在重试。";
          }
          sourceDiscoveryPollTimer = window.setTimeout(pollSourceDiscoveryJob, 2500);
        }
      };

      const retrySourceDiscoveryJob = async () => {
        if (!sourceDiscoveryJobId) return;
        clearSourceDiscoveryActions();
        setCreateSubmitDisabled(true);
        if (createStatus) createStatus.textContent = "重新搜索中…";
        try {
          const job = await HallOfFameClient.requestJson(
            "/v1/persona-distill-source-discovery-jobs/" +
              encodeURIComponent(sourceDiscoveryJobId) +
              "/retry",
            {
              method: "POST",
            },
          );
          sourceDiscoveryJobId = job.sourceDiscoveryJobId;
          window.history.replaceState({}, "", buildCreateSourceDiscoveryJobUrl(sourceDiscoveryJobId));
          renderSourceDiscoveryJob(job);
          showState("light-start");
          stopSourceDiscoveryPolling();
          sourceDiscoveryPollTimer = window.setTimeout(pollSourceDiscoveryJob, 800);
        } catch (error) {
          setCreateSubmitDisabled(false);
          if (createStatus) {
            createStatus.textContent = error instanceof Error ? error.message : "重试失败，请稍后再试。";
          }
          renderSourceDiscoveryRetryAction();
        }
      };

      const loadJob = async () => {
        if (!jobId) return null;
        return HallOfFameClient.requestJson("/v1/persona-distill-jobs/" + jobId, {
          method: "GET",
        });
      };

      const formatTraceTime = (value) => {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      };

      const stringifyDebugJson = (value) => {
        const text = JSON.stringify(value ?? null, null, 2);
        return text.length > 1800 ? text.slice(0, 1800) + "...<truncated>" : text;
      };

      const renderDistillTrace = (trace) => {
        if (!distillDebugPanel || !distillDebugList || !shouldShowDistillDebug()) return;
        distillDebugPanel.hidden = false;
        const events = Array.isArray(trace?.events) ? trace.events : [];
        const runs = Array.isArray(trace?.runs) ? trace.runs : [];
        const artifacts = Array.isArray(trace?.artifacts) ? trace.artifacts : [];
        if (!events.length && !runs.length && !artifacts.length) {
          distillDebugList.innerHTML = "<li class='empty-state'>暂无日志</li>";
          return;
        }

        const eventItems = events.map((event) =>
          "<li class='source-item'><strong>" +
          HallOfFameClient.escapeHtml(event.label || event.kind) +
          "</strong><div class='meta'>" +
          HallOfFameClient.escapeHtml(
            formatTraceTime(event.at) +
              (event.toolName ? " / " + event.toolName : "") +
              (event.status ? " / " + event.status : ""),
          ) +
          "</div>" +
          (event.summary ? "<p class='body-copy'>" + HallOfFameClient.escapeHtml(event.summary) + "</p>" : "") +
          "</li>",
        );

        const runItems = runs.map((run) => {
          const inputJson = HallOfFameClient.escapeHtml(stringifyDebugJson(run.input));
          const outputJson = HallOfFameClient.escapeHtml(stringifyDebugJson(run.output));
          return (
            "<li class='source-item'><details>" +
            "<summary>" +
            HallOfFameClient.escapeHtml(String(run.seq) + ". " + run.toolName + " / " + run.status) +
            "</summary>" +
            "<div class='meta'>" +
            HallOfFameClient.escapeHtml(
              formatTraceTime(run.startedAt) +
                (run.durationMs === null || run.durationMs === undefined ? "" : " / " + run.durationMs + "ms"),
            ) +
            "</div>" +
            (run.errorMessage ? "<p class='body-copy'>" + HallOfFameClient.escapeHtml(run.errorMessage) + "</p>" : "") +
            "<pre class='debug-json'>输入\\n" +
            inputJson +
            "\\n\\n输出\\n" +
            outputJson +
            "</pre>" +
            "</details></li>"
          );
        });

        const artifactItems = artifacts.map((artifact) =>
          "<li class='source-item'><details><summary>" +
          HallOfFameClient.escapeHtml("artifact / " + artifact.stage) +
          "</summary><div class='meta'>" +
          HallOfFameClient.escapeHtml(formatTraceTime(artifact.createdAt)) +
          "</div><pre class='debug-json'>" +
          HallOfFameClient.escapeHtml(stringifyDebugJson(artifact.artifact)) +
          "</pre></details></li>",
        );

        distillDebugList.innerHTML = [...eventItems, ...runItems, ...artifactItems].join("");
      };

      const loadDistillTrace = async () => {
        if (!jobId || !shouldShowDistillDebug()) return;
        try {
          const trace = await HallOfFameClient.requestJson("/v1/persona-distill-jobs/" + encodeURIComponent(jobId) + "/trace", {
            method: "GET",
          });
          renderDistillTrace(trace);
        } catch (error) {
          if (distillDebugPanel) distillDebugPanel.hidden = false;
          if (distillDebugList) {
            distillDebugList.innerHTML =
              "<li class='empty-state'>" +
              HallOfFameClient.escapeHtml(error instanceof Error ? error.message : String(error)) +
              "</li>";
          }
        }
      };

      const renderJob = (job) => {
        if (!job) return;
        personaId = job.personaId || personaId;
        if (jobTitleSlot) jobTitleSlot.textContent = job.intent?.normalizedName || normalizedName || "正在蒸馏";
        if (jobStatusSlot) jobStatusSlot.textContent = job.currentStep || job.status;
        if (jobProgressSlot) jobProgressSlot.textContent = String(job.progress || 0) + "%";
      };

      const stopPolling = () => {
        if (pollTimer) {
          window.clearTimeout(pollTimer);
          pollTimer = null;
        }
      };

      const getJobObjectHref = (job) =>
        typeof job?.objectHref === "string" && job.objectHref
          ? job.objectHref
          : job?.objectId
            ? "/profile/objects/" + encodeURIComponent(job.objectId)
            : "/profile/objects";

      const pollJob = async () => {
        if (!jobId) return;
        try {
          const job = await loadJob();
          renderJob(job);
          await loadDistillTrace();
          if (job.status === "SUCCEEDED") {
            stopPolling();
            window.location.href = getJobObjectHref(job);
            return;
          }
          if (job.status === "FAILED" || job.status === "BLOCKED" || job.status === "NEEDS_MORE_SOURCES" || job.status === "SUPERSEDED") {
            stopPolling();
            if (jobStatusSlot) {
              jobStatusSlot.textContent =
                job.status === "SUPERSEDED"
                  ? "已被新的蒸馏任务替代"
                  : job.error?.message || (job.missingRequirements || []).join("；") || "需要补充资料";
            }
            return;
          }
          pollTimer = window.setTimeout(pollJob, 1500);
        } catch (error) {
          if (jobStatusSlot) jobStatusSlot.textContent = error instanceof Error ? error.message : String(error);
          pollTimer = window.setTimeout(pollJob, 2500);
        }
      };

      tagButtons.forEach((button) => {
        button.addEventListener("click", () => {
          button.classList.toggle("is-active");
        });
      });

      sourceDiscoveryActions?.addEventListener("click", (event) => {
        const retryButton = event.target.closest("[data-retry-source-discovery]");
        if (!retryButton) return;
        void retrySourceDiscoveryJob();
      });

      createForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const query = String(new FormData(form).get("query") || "").trim();
        const tags = collectTags();

        if (!query) {
          createStatus.textContent = "请填写对象名称";
          return;
        }

        if (isSourceDiscoverySubmitting || createSubmitButton?.disabled) {
          return;
        }

        isSourceDiscoverySubmitting = true;
        stopSourceDiscoveryPolling();
        stopPolling();
        clearSourceDiscoveryActions();
        sourceDiscoveryJobId = null;
        discoveryId = null;
        sourceCandidates = [];
        extraSources = [];
        createStatus.textContent = "识别对象中…";
        setCreateSubmitDisabled(true);

        try {
          await HallOfFameClient.ensureAnonymousSession();
          const intent = await HallOfFameClient.requestJson("/v1/persona-distill-intents", {
            method: "POST",
            body: JSON.stringify({
              query,
              usageIntent: "chat_companion",
              focus: tags,
            }),
          });

          intentId = intent.intentId;
          normalizedName = intent.normalizedName;
          if (intent.nextStep !== "DISCOVER_SOURCES") {
            createStatus.textContent = intent.riskReasons?.join("；") || "这个对象暂时不能蒸馏";
            isSourceDiscoverySubmitting = false;
            setCreateSubmitDisabled(false);
            return;
          }

          createStatus.textContent = "搜索资料中…";
          const sourceDiscoveryJob = await HallOfFameClient.requestJson("/v1/persona-distill-source-discovery", {
            method: "POST",
            body: JSON.stringify({
              intentId,
              preferredLanguage: "zh-CN",
              maxSourcesPerBucket: 4,
            }),
          });

          sourceDiscoveryJobId = sourceDiscoveryJob.sourceDiscoveryJobId;
          window.history.replaceState({}, "", buildCreateSourceDiscoveryJobUrl(sourceDiscoveryJobId));
          isSourceDiscoverySubmitting = false;
          renderSourceDiscoveryJob(sourceDiscoveryJob);
          showState("light-start");
          sourceDiscoveryPollTimer = window.setTimeout(pollSourceDiscoveryJob, 800);
        } catch (error) {
          createStatus.textContent = error instanceof Error ? error.message : String(error);
          isSourceDiscoverySubmitting = false;
          setCreateSubmitDisabled(false);
        }
      });

      document.querySelector("[data-text-source-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!discoveryId) {
          sourceStatus.textContent = "请先搜索资料。";
          return;
        }
        const textSourceForm = event.currentTarget;
        const form = new FormData(textSourceForm);
        sourceStatus.textContent = "添加中…";
        try {
          const result = await HallOfFameClient.requestJson("/v1/persona-distill-discoveries/" + discoveryId + "/extra-sources", {
            method: "POST",
            body: JSON.stringify({
              extraTextSources: [
                {
                  title: String(form.get("title") || ""),
                  sourceKind: String(form.get("sourceKind") || "PRIMARY"),
                  content: String(form.get("content") || ""),
                },
              ],
              extraUrlSources: [],
            }),
          });
          sourceCandidates = result.sourceCandidates || sourceCandidates;
          extraSources = result.pendingExtraSources || [];
          sourceStatus.textContent = "已添加。";
          textSourceForm.reset();
          renderDiscoverySources();
          renderExtraSources();
        } catch (error) {
          sourceStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      document.querySelector("[data-url-source-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!discoveryId) {
          sourceStatus.textContent = "请先搜索资料。";
          return;
        }
        const urlSourceForm = event.currentTarget;
        const form = new FormData(urlSourceForm);
        sourceStatus.textContent = "添加链接中…";
        try {
          const result = await HallOfFameClient.requestJson("/v1/persona-distill-discoveries/" + discoveryId + "/extra-sources", {
            method: "POST",
            body: JSON.stringify({
              extraTextSources: [],
              extraUrlSources: [
                {
                  url: String(form.get("url") || ""),
                  title: String(form.get("title") || ""),
                  sourceKind: String(form.get("sourceKind") || "SECONDARY"),
                },
              ],
            }),
          });
          sourceCandidates = result.sourceCandidates || sourceCandidates;
          extraSources = result.pendingExtraSources || [];
          sourceStatus.textContent = "已添加。";
          urlSourceForm.reset();
          renderDiscoverySources();
          renderExtraSources();
        } catch (error) {
          sourceStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      document.querySelector("[data-start-distill]")?.addEventListener("click", async () => {
        if (!intentId || !discoveryId) {
          sourceStatus.textContent = "请先确认资料。";
          return;
        }
        const selectedSourceCandidateIds = collectSelectedSourceIds();
        if (!selectedSourceCandidateIds.length && !collectSelectedExtraSourceIds().length) {
          sourceStatus.textContent = "至少选择一条资料。";
          return;
        }
        sourceStatus.textContent = "任务创建中…";
        try {
          const job = await HallOfFameClient.requestJson("/v1/persona-distill-jobs", {
            method: "POST",
            body: JSON.stringify({
              intentId,
              discoveryId,
              selectedSourceCandidateIds,
              selectedExtraSourceIds: collectSelectedExtraSourceIds(),
            }),
          });
          jobId = job.jobId;
          personaId = job.personaId || null;
          window.history.replaceState({}, "", buildCreateJobUrl(jobId));
          renderJob(job);
          await loadDistillTrace();
          showState("workbench");
          sourceStatus.textContent = "";
          stopSourceDiscoveryPolling();
          stopPolling();
          pollTimer = window.setTimeout(pollJob, 800);
        } catch (error) {
          sourceStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      void HallOfFameClient.ensureAnonymousSession().then(async () => {
        if (initialSourceDiscoveryJobId) {
          const sourceDiscoveryJob = await loadSourceDiscoveryJob();
          renderSourceDiscoveryJob(sourceDiscoveryJob);
          if (sourceDiscoveryJob?.status === "SUCCEEDED") {
            if (sourceDiscoveryJob.discovery) {
              renderDiscovery(sourceDiscoveryJob.discovery);
              showState("success");
            } else if (createStatus) {
              createStatus.textContent = "资料已找到，但结果为空，请重试。";
              renderSourceDiscoveryRetryAction();
              showState("light-start");
            }
            return;
          }
          if (sourceDiscoveryJob?.status === "FAILED" || sourceDiscoveryJob?.status === "BLOCKED") {
            showState("light-start");
            return;
          }
          showState("light-start");
          sourceDiscoveryPollTimer = window.setTimeout(pollSourceDiscoveryJob, 800);
          return;
        }
        if (!initialJobId) return;
        const job = await loadJob();
        if (job?.status === "SUCCEEDED" && shouldAddSources) {
          intentId = job.intent?.intentId || null;
          normalizedName = job.intent?.normalizedName || "";
          selectedSourceCandidateIdsFromJob = job.selectedSourceCandidateIds || [];
          extraSources = job.pendingExtraSources || [];
          renderDiscovery(job.discovery);
          if (sourceStatus) sourceStatus.textContent = "可以补充资料后重新蒸馏。";
          showState("success");
          return;
        }
        if (job?.status === "SUPERSEDED") {
          if (sourceStatus) sourceStatus.textContent = "这个任务已被新的蒸馏任务替代，请从“我的”查看最新对象。";
          showState("light-start");
          return;
        }
        if (job?.status === "NEEDS_MORE_SOURCES" || job?.status === "FAILED" || job?.status === "BLOCKED") {
          intentId = job.intent?.intentId || null;
          normalizedName = job.intent?.normalizedName || "";
          selectedSourceCandidateIdsFromJob = job.selectedSourceCandidateIds || [];
          extraSources = job.pendingExtraSources || [];
          renderDiscovery(job.discovery);
          if (sourceStatus) {
            sourceStatus.textContent = job.error?.message || (job.missingRequirements || []).join("；") || "需要补充资料后重试。";
          }
          showState("success");
          return;
        }
        showState("workbench");
        renderJob(job);
        await loadDistillTrace();
        if (job?.status === "SUCCEEDED") {
          window.location.href = getJobObjectHref(job);
          return;
        }
        pollTimer = window.setTimeout(pollJob, 800);
      });
    `,
  });

const renderPreviewPage = async (personaVersionId: string) =>
  renderShell({
    title: "打开对象",
    body: `
      <div class="page-stage">
        ${renderPageHeader({
          eyebrow: "对象入口",
          title: "正在打开对象",
          subtitle: "如果没有自动跳转，可以回到我的对象。",
          extra: '<a class="mini-link" href="/profile/objects">我的对象</a>',
        })}
        <section class="stage-card">
          <h3 class="card-title">正在定位对象</h3>
          <p class="body-copy" data-preview-status>稍等一下。</p>
          <div class="actions" data-preview-actions></div>
        </section>
      </div>
    `,
    script: `
      const versionId = ${JSON.stringify(personaVersionId)};
      const previewStatus = document.querySelector("[data-preview-status]");
      const previewActions = document.querySelector("[data-preview-actions]");

      const renderFallback = (message, href, label) => {
        if (previewStatus) {
          previewStatus.textContent = message;
        }
        if (previewActions) {
          previewActions.innerHTML =
            "<a class='utility-link' href='" +
            HallOfFameClient.escapeHtml(href) +
            "'>" +
            HallOfFameClient.escapeHtml(label) +
            "</a>";
        }
      };

      const findOwnedObject = async () => {
        try {
          const dashboard = await HallOfFameClient.requestJson("/v1/me/persona-inventory", {
            method: "GET",
          });
          const items = Array.isArray(dashboard?.items) ? dashboard.items : [];
          return items.find((entry) => entry?.personaVersionId === versionId) || null;
        } catch {
          return null;
        }
      };

      const openVersion = async () => {
        await HallOfFameClient.ensureAnonymousSession();
        const ownedItem = await findOwnedObject();
        if (ownedItem?.objectId) {
          window.location.replace("/profile/objects/" + encodeURIComponent(ownedItem.objectId));
          return;
        }

        try {
          const version = await HallOfFameClient.requestJson("/v1/persona-versions/" + versionId, {
            method: "GET",
          });
          if (version?.ownerDisplayStatus === "PUBLIC" && version.personaHref) {
            window.location.replace(version.personaHref);
            return;
          }
          if (version?.shareHref) {
            window.location.replace(version.shareHref);
            return;
          }
          if (version?.addSourcesHref) {
            renderFallback("这个对象还需要补资料。", version.addSourcesHref, "继续补资料");
            return;
          }
          renderFallback("这个对象暂时不能打开。", "/profile/objects", "回到我的对象");
        } catch {
          renderFallback("这个对象暂时不能打开。", "/profile/objects", "回到我的对象");
          return;
        }
      };

      void openVersion();
    `,
  });

const renderProfilePage = () =>
  renderShell({
    title: "我的",
    body: buildProfilePageBody(),
    script: `
      const sessionCopySlot = document.querySelector("[data-profile-session-copy]");
      const loadProfileSession = async () => {
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
      };

      void loadProfileSession();
    `,
  });

const renderMyObjectsPage = () =>
  renderShell({
    title: "我的对象",
    body: buildMyObjectsPageBody(),
    script: `
      const listSlot = document.querySelector("[data-my-objects-list]");
      const statusCopy = {
        CREATING: "创建中",
        NEEDS_SOURCES: "需要补资料",
        FAILED: "生成失败",
        PENDING_CONFIRM: "待确认",
        READY: "可聊天",
        PUBLIC: "已公开",
      };

      const formatObjectTime = (value) => {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const diff = Date.now() - date.getTime();
        if (diff >= 0 && diff < 60 * 60 * 1000) return "刚刚";
        return new Intl.DateTimeFormat("zh-CN", {
          month: "2-digit",
          day: "2-digit",
        }).format(date);
      };

      const renderObjectItem = (item) => (
        "<li><a class='history-item' href='/profile/objects/" +
        encodeURIComponent(item.objectId) +
        "'>" +
        "<div class='history-avatar' aria-hidden='true'>" +
        HallOfFameClient.escapeHtml((item.displayName || "对象").slice(0, 1)) +
        "</div>" +
        "<div class='history-main'>" +
        "<div class='history-head'>" +
        "<h3 class='history-name'>" +
        HallOfFameClient.escapeHtml(item.displayName || "对象") +
        "</h3>" +
        "<span class='history-time'>" +
        HallOfFameClient.escapeHtml(formatObjectTime(item.updatedAt)) +
        "</span>" +
        "</div>" +
        "<p class='history-snippet'>" +
        HallOfFameClient.escapeHtml((statusCopy[item.status] || "处理中") + " · " + (item.intro || "还没有简介。")) +
        "</p>" +
        "</div>" +
        "</a></li>"
      );

      const renderObjectGroups = (groups) => {
        if (!listSlot) return;
        const sections = [
          ["needsAttention", "需要处理", groups?.needsAttention || []],
          ["creating", "创建中", groups?.creating || []],
          ["ready", "可聊天", groups?.ready || []],
          ["public", "已公开", groups?.public || []],
        ];
        const visibleSections = sections.filter((section) => section[2].length > 0);
        if (!visibleSections.length) {
          listSlot.innerHTML = "<li class='empty-state'>还没有对象，先创建一个。</li>";
          return;
        }

        listSlot.innerHTML = visibleSections
          .map((section) => {
            const key = section[0];
            const title = section[1];
            const items = section[2];
            return (
              "<li class='mini-eyebrow' data-inventory-group='" +
              HallOfFameClient.escapeHtml(key) +
              "'>" +
              HallOfFameClient.escapeHtml(title) +
              "</li>" +
              items.map(renderObjectItem).join("")
            );
          })
          .join("");
      };

      const loadObjects = async () => {
        await HallOfFameClient.ensureAnonymousSession();
        try {
          const dashboard = await HallOfFameClient.requestJson("/v1/me/persona-inventory", {
            method: "GET",
          });
          renderObjectGroups(dashboard.groups);
        } catch (error) {
          if (listSlot) {
            listSlot.innerHTML = "<li class='empty-state'>" + HallOfFameClient.escapeHtml(error instanceof Error ? error.message : String(error)) + "</li>";
          }
        }
      };

      void loadObjects();
    `,
  });

const renderMyObjectDetailPage = (objectId: string) =>
  renderShell({
    title: "对象详情",
    body: buildMyObjectDetailPageBody(objectId),
    script: `
      const objectId = ${JSON.stringify(objectId)};
      const titleSlot = document.querySelector("[data-my-object-title]");
      const subtitleSlot = document.querySelector("[data-my-object-subtitle]");
      const nameSlot = document.querySelector("[data-my-object-name]");
      const introSlot = document.querySelector("[data-my-object-intro]");
      const statusSlot = document.querySelector("[data-my-object-status]");
      const messageSlot = document.querySelector("[data-my-object-message]");
      const actionsSlot = document.querySelector("[data-my-object-actions]");
      const actionStatus = document.querySelector("[data-my-object-action-status]");
      const editPanel = document.querySelector("[data-my-object-edit-panel]");
      const editForm = document.querySelector("[data-my-object-edit-form]");
      const editCancel = document.querySelector("[data-my-object-edit-cancel]");
      let currentObject = null;

      const statusCopy = {
        CREATING: "创建中",
        NEEDS_SOURCES: "需要补资料",
        FAILED: "生成失败",
        PENDING_CONFIRM: "待确认",
        READY: "可聊天",
        PUBLIC: "已公开",
      };
      const actionCopy = {
        CHAT: "聊天",
        EDIT: "编辑",
        ADD_SOURCES: "补资料",
        DELETE: "删除",
        CONFIRM: "保存到我的",
        PUBLISH: "公开分享",
        SHARE: "查看分享",
        RETRY: "重新生成",
      };

      const setActionStatus = (content) => {
        if (actionStatus) actionStatus.textContent = content || "";
      };

      const renderAction = (action, object) => {
        const copy = actionCopy[action] || "打开";
        if (action === "CHAT") {
          return object.chatHref
            ? "<a class='utility-link' href='" + HallOfFameClient.escapeHtml(object.chatHref) + "'>" + copy + "</a>"
            : "";
        }
        if (action === "ADD_SOURCES" || action === "RETRY") {
          return "<a class='utility-link secondary' href='" + HallOfFameClient.escapeHtml(object.addSourcesHref || "/create") + "'>" + copy + "</a>";
        }
        if (action === "SHARE") {
          return object.shareHref
            ? "<a class='utility-link secondary' href='" + HallOfFameClient.escapeHtml(object.shareHref) + "'>" + copy + "</a>"
            : "";
        }
        const buttonClass = action === "DELETE" ? "danger" : "secondary";
        return "<button type='button' class='" + buttonClass + "' data-my-object-action='" + HallOfFameClient.escapeHtml(action) + "'>" + copy + "</button>";
      };

      const renderObject = (object) => {
        currentObject = object;
        if (titleSlot) titleSlot.textContent = object.displayName || "对象详情";
        if (subtitleSlot) subtitleSlot.textContent = statusCopy[object.status] || "处理中";
        if (nameSlot) nameSlot.textContent = object.displayName || "对象";
        if (introSlot) introSlot.textContent = object.intro || "还没有简介。";
        if (statusSlot) statusSlot.textContent = statusCopy[object.status] || "处理中";
        if (messageSlot) messageSlot.textContent = object.userMessage || "";
        if (actionsSlot) {
          const html = (object.availableActions || []).map((action) => renderAction(action, object)).filter(Boolean).join("");
          actionsSlot.innerHTML = html || "<div class='empty-state'>现在还没有可操作的内容。</div>";
        }
        if (editForm) {
          editForm.elements.displayName.value = object.displayName || "";
          editForm.elements.intro.value = object.intro || "";
        }
      };

      const loadObject = async () => {
        await HallOfFameClient.ensureAnonymousSession();
        try {
          const object = await HallOfFameClient.requestJson("/v1/me/objects/" + encodeURIComponent(objectId), {
            method: "GET",
          });
          renderObject(object);
        } catch (error) {
          if (nameSlot) nameSlot.textContent = "对象不存在或已删除。";
          if (introSlot) introSlot.textContent = "返回我的对象重新选择。";
          if (statusSlot) statusSlot.textContent = "不可用";
          if (actionsSlot) actionsSlot.innerHTML = "<a class='utility-link' href='/profile/objects'>返回我的对象</a>";
        }
      };

      actionsSlot?.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-my-object-action]");
        if (!button || !currentObject) return;
        const action = button.getAttribute("data-my-object-action");
        event.preventDefault();

        if (action === "EDIT") {
          if (editPanel) editPanel.hidden = false;
          setActionStatus("");
          return;
        }

        try {
          if (action === "CONFIRM") {
            setActionStatus("保存中...");
            const result = await HallOfFameClient.requestJson("/v1/me/objects/" + encodeURIComponent(objectId) + "/confirm", {
              method: "POST",
            });
            setActionStatus(result.message || "已保存。");
            renderObject(result.object);
            return;
          }
          if (action === "PUBLISH") {
            setActionStatus("公开中...");
            const result = await HallOfFameClient.requestJson("/v1/me/objects/" + encodeURIComponent(objectId) + "/publish", {
              method: "POST",
            });
            setActionStatus(result.message || "已公开。");
            renderObject(result.object);
            return;
          }
          if (action === "DELETE") {
            if (!window.confirm("删除后会从我的对象移除。")) return;
            setActionStatus("删除中...");
            await HallOfFameClient.requestJson("/v1/me/objects/" + encodeURIComponent(objectId), {
              method: "DELETE",
            });
            window.location.href = "/profile/objects";
          }
        } catch (error) {
          setActionStatus(error instanceof Error ? error.message : String(error));
        }
      });

      editCancel?.addEventListener("click", () => {
        if (editPanel) editPanel.hidden = true;
      });

      editForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          setActionStatus("保存中...");
          const formData = new FormData(editForm);
          const result = await HallOfFameClient.requestJson("/v1/me/objects/" + encodeURIComponent(objectId), {
            method: "PATCH",
            body: JSON.stringify({
              displayName: String(formData.get("displayName") || "").trim(),
              intro: String(formData.get("intro") || "").trim() || null,
            }),
          });
          if (editPanel) editPanel.hidden = true;
          setActionStatus(result.message || "已更新。");
          renderObject(result.object);
        } catch (error) {
          setActionStatus(error instanceof Error ? error.message : String(error));
        }
      });

      void loadObject();
    `,
  });

export const renderMyObjectChatPage = (
  objectId: string,
  query: {
    chatId?: string | string[];
  } = {},
) =>
  renderShell({
    title: "对象聊天",
    body: buildMyObjectChatPageBody(objectId),
    shellClass: "chat-only",
    script:
      `
        (() => {
          const objectId = ${JSON.stringify(objectId)};
          const threadName = document.querySelector("[data-thread-name]");
          const threadStatus = document.querySelector("[data-thread-status]");
          const objectChatLog = document.querySelector("[data-chat-log]");
          const objectChatForm = document.querySelector("[data-chat-form]");
          const loadObjectForChat = async () => {
            await HallOfFameClient.ensureAnonymousSession();
            try {
              const object = await HallOfFameClient.requestJson("/v1/me/objects/" + encodeURIComponent(objectId), {
                method: "GET",
              });
              if (!object.chatHref || !["READY", "PUBLIC"].includes(object.status)) {
                if (threadStatus) threadStatus.textContent = "现在还不能聊天";
                if (objectChatForm) objectChatForm.hidden = true;
                return;
              }
              if (threadName) threadName.textContent = object.displayName || "对象";
              if (threadStatus) threadStatus.textContent = "等你开口";
              if (objectChatLog) {
                objectChatLog.setAttribute("data-chat-assistant-name", object.displayName || "对象");
                const label = objectChatLog.querySelector(".bubble-label");
                if (label) label.textContent = object.displayName || "对象";
                const copy = objectChatLog.querySelector(".bubble-copy");
                if (copy) copy.textContent = object.intro || "想聊什么？";
              }
            } catch (error) {
              if (threadStatus) threadStatus.textContent = "对象不存在或已删除";
              if (objectChatForm) objectChatForm.hidden = true;
            }
          };
          void loadObjectForChat();
        })();
      ` +
      renderChatScript({
        targetType: "owned_object",
        objectId,
        initialChatId: getSingleQueryValue(query.chatId),
      }),
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
  app.get("/favicon.ico", async (_request, reply) => reply.status(204).send());

  app.get("/", async (_request, reply) => sendHtml(reply, await renderFeaturedList()));
  app.get("/history", async (_request, reply) => sendHtml(reply, await renderHistoryPage()));
  app.get<{ Params: { chatId: string } }>("/history/:chatId", async (request, reply) =>
    sendHtml(reply, renderReadOnlyHistoryChatPage(request.params.chatId)),
  );
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
  app.get("/profile/objects", async (_request, reply) => sendHtml(reply, renderMyObjectsPage()));
  app.get<{ Params: { objectId: string }; Querystring: { chatId?: string | string[] } }>(
    "/profile/objects/:objectId/chat",
    async (request, reply) => sendHtml(reply, renderMyObjectChatPage(request.params.objectId, request.query)),
  );
  app.get<{ Params: { objectId: string } }>("/profile/objects/:objectId", async (request, reply) =>
    sendHtml(reply, renderMyObjectDetailPage(request.params.objectId)),
  );

  return app;
};

export { buildReplyInspectorHtml };
