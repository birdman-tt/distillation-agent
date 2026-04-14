import Fastify, { type FastifyReply } from "fastify";
import { uiTokens } from "@hall-of-fame/ui-tokens";

import { buildReplyInspectorHtml } from "./chat-presentation.js";

const apiBaseUrl = () => process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";

const pageStyles = `
  :root {
    --bg: ${uiTokens.colors.canvas};
    --bg-raised: ${uiTokens.colors.canvasRaised};
    --bg-soft: ${uiTokens.colors.canvasSoft};
    --ink: ${uiTokens.colors.ink};
    --ink-muted: ${uiTokens.colors.inkMuted};
    --ink-soft: ${uiTokens.colors.inkSoft};
    --line: ${uiTokens.colors.border};
    --line-strong: ${uiTokens.colors.borderStrong};
    --accent: ${uiTokens.colors.accent};
    --accent-deep: ${uiTokens.colors.accentDeep};
    --accent-wash: ${uiTokens.colors.accentWash};
    --success: ${uiTokens.colors.success};
    --warning: ${uiTokens.colors.warning};
    --danger: ${uiTokens.colors.danger};
    --focus: ${uiTokens.colors.focusRing};
    --radius-card: ${uiTokens.radius.large};
    --radius-panel: ${uiTokens.radius.medium};
    --radius-pill: ${uiTokens.radius.pill};
    --radius-bubble: ${uiTokens.radius.bubble};
    --shadow-panel: ${uiTokens.shadow.panel};
    --shadow-card: ${uiTokens.shadow.card};
    --shadow-glow: ${uiTokens.shadow.glow};
    --serif: ${uiTokens.typography.display.family};
    --sans: ${uiTokens.typography.body.family};
    --mono: ${uiTokens.typography.mono.family};
    --shell-width: ${uiTokens.layout.shellMaxWidth}px;
    --read-width: ${uiTokens.layout.maxReadableWidth}px;
    --title-hero: ${uiTokens.typography.display.sizes.hero};
    --title-page: ${uiTokens.typography.display.sizes.page};
    --title-panel: ${uiTokens.typography.display.sizes.panel};
    --title-card: ${uiTokens.typography.display.sizes.card};
  }

  * { box-sizing: border-box; }

  html {
    scroll-behavior: smooth;
  }

  body {
    margin: 0;
    color: var(--ink);
    font-family: var(--sans);
    background:
      radial-gradient(circle at top right, rgba(155, 92, 46, 0.10), transparent 22rem),
      radial-gradient(circle at top left, rgba(122, 70, 33, 0.06), transparent 18rem),
      linear-gradient(180deg, #fbf7f0 0%, var(--bg) 100%);
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

  :focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .shell {
    position: relative;
    max-width: var(--shell-width);
    margin: 0 auto;
    padding: 24px 16px 64px;
  }

  .shell::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(to right, rgba(155, 92, 46, 0.018) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(155, 92, 46, 0.016) 1px, transparent 1px);
    background-size: 24px 24px;
    mask-image: linear-gradient(180deg, rgba(0,0,0,0.25), transparent 85%);
  }

  .stage {
    display: grid;
    gap: 24px;
  }

  .hero {
    position: relative;
    overflow: hidden;
    display: grid;
    gap: 20px;
    padding: 24px 20px;
    border: 1px solid rgba(203, 180, 148, 0.72);
    border-radius: 32px;
    background:
      linear-gradient(160deg, rgba(255, 253, 248, 0.92), rgba(250, 242, 230, 0.94)),
      var(--bg-raised);
    box-shadow: var(--shadow-panel);
  }

  .hero::after {
    content: "";
    position: absolute;
    inset: auto -10% -35% auto;
    width: 220px;
    height: 220px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(155, 92, 46, 0.14), transparent 70%);
  }

  .hero-head {
    display: grid;
    gap: 12px;
    max-width: 38rem;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    padding: 6px 12px;
    border-radius: var(--radius-pill);
    background: var(--accent-wash);
    color: var(--accent);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .hero-title,
  .page-title,
  .section-title,
  .card-title {
    font-family: var(--serif);
    color: var(--ink);
    letter-spacing: -0.02em;
    text-wrap: balance;
  }

  .hero-title {
    margin: 0;
    font-size: var(--title-hero);
    font-weight: 500;
    line-height: 1.02;
  }

  .hero-copy,
  .hero-note {
    margin: 0;
    color: var(--ink-muted);
    font-size: 16px;
    line-height: 1.68;
  }

  .hero-strip {
    display: grid;
    gap: 12px;
  }

  .hero-strip-card {
    padding: 16px 18px;
    border-radius: 22px;
    border: 1px solid rgba(203, 180, 148, 0.72);
    background: rgba(255, 253, 248, 0.82);
  }

  .hero-strip-card strong {
    display: block;
    margin-bottom: 6px;
    font-size: 15px;
  }

  .hero-strip-card p {
    margin: 0;
    color: var(--ink-muted);
    line-height: 1.6;
    font-size: 14px;
  }

  .top-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .nav-link,
  .button-link,
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 16px;
    border-radius: 16px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: transform ${uiTokens.motion.sectionRevealMs}ms ease, background ${uiTokens.motion.sectionRevealMs}ms ease, border-color ${uiTokens.motion.sectionRevealMs}ms ease;
  }

  .nav-link,
  .button-link.secondary,
  button.secondary {
    background: rgba(255, 253, 248, 0.78);
    border-color: rgba(203, 180, 148, 0.84);
    color: var(--ink);
  }

  .button-link.primary,
  button {
    background: linear-gradient(180deg, var(--accent), var(--accent-deep));
    color: #fff8f1;
    box-shadow: var(--shadow-card);
  }

  .button-link.success,
  button.ok {
    background: linear-gradient(180deg, #387654, var(--success));
    color: #f5fff8;
  }

  button.danger,
  .button-link.danger {
    background: linear-gradient(180deg, #aa4a4a, var(--danger));
    color: #fff7f7;
  }

  .nav-link:hover,
  .button-link:hover,
  button:hover {
    transform: translateY(-1px);
  }

  .session-banner {
    margin-top: -4px;
    padding: 12px 14px;
    border-radius: 18px;
    border: 1px solid rgba(203, 180, 148, 0.72);
    background: rgba(255, 251, 244, 0.9);
    color: var(--ink-muted);
    font-size: 14px;
  }

  .page-stack {
    display: grid;
    gap: 18px;
  }

  .section-label {
    margin: 0;
    color: var(--accent);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .page-title {
    margin: 0;
    font-size: var(--title-page);
    line-height: 1.06;
    font-weight: 500;
  }

  .page-subtitle {
    margin: 0;
    max-width: 48rem;
    color: var(--ink-muted);
    line-height: 1.68;
    font-size: 16px;
  }

  .panel,
  .card {
    display: grid;
    gap: 14px;
    padding: 18px;
    border-radius: 24px;
    border: 1px solid rgba(216, 200, 178, 0.86);
    background: rgba(255, 253, 248, 0.9);
    box-shadow: var(--shadow-card);
  }

  .panel-muted {
    background: rgba(250, 243, 233, 0.78);
  }

  .section-title {
    margin: 0;
    font-size: var(--title-panel);
    line-height: 1.12;
    font-weight: 500;
  }

  .card-title {
    margin: 0;
    font-size: var(--title-card);
    line-height: 1.14;
    font-weight: 500;
  }

  .body-copy {
    margin: 0;
    color: var(--ink-muted);
    line-height: 1.68;
    font-size: 15px;
  }

  .meta {
    color: var(--ink-soft);
    font-size: 13px;
    line-height: 1.5;
  }

  .hero-actions,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .mobile-grid {
    display: grid;
    gap: 18px;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    padding: 6px 12px;
    border-radius: var(--radius-pill);
    background: var(--accent-wash);
    color: var(--accent);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .persona-card {
    position: relative;
    overflow: hidden;
    display: grid;
    gap: 14px;
    padding: 18px;
    border-radius: 26px;
    border: 1px solid rgba(203, 180, 148, 0.86);
    background:
      linear-gradient(180deg, rgba(255, 253, 248, 0.96), rgba(249, 241, 230, 0.94));
    box-shadow: var(--shadow-card);
  }

  .persona-card::after {
    content: "";
    position: absolute;
    inset: auto -24px -28px auto;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(155, 92, 46, 0.12), transparent 72%);
  }

  .persona-topline {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }

  .persona-name {
    margin: 0;
    font-family: var(--serif);
    font-size: 24px;
    line-height: 1.02;
    font-weight: 500;
  }

  .persona-intro {
    margin: 0;
    color: var(--ink-muted);
    line-height: 1.7;
    font-size: 15px;
  }

  .question-list {
    display: grid;
    gap: 10px;
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .question-slip,
  .answer-note,
  .queue-item,
  .source-item {
    padding: 14px;
    border-radius: 18px;
    border: 1px solid rgba(216, 200, 178, 0.82);
    background: rgba(255, 250, 243, 0.88);
  }

  .question-slip {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    justify-content: space-between;
  }

  .question-slip strong {
    font-weight: 600;
  }

  .question-slip button,
  .question-slip .button-link,
  .prompt-button {
    background: transparent;
    color: var(--accent-deep);
    border: 1px solid rgba(203, 180, 148, 0.92);
    box-shadow: none;
    min-height: 40px;
  }

  .prompt-button {
    justify-content: flex-start;
    width: 100%;
    background: rgba(255, 250, 243, 0.92);
    text-align: left;
  }

  .stack {
    display: grid;
    gap: 12px;
  }

  .chat-stage {
    display: grid;
    gap: 16px;
  }

  .chat-shell {
    display: grid;
    gap: 16px;
    padding: 18px;
    border-radius: 28px;
    border: 1px solid rgba(203, 180, 148, 0.88);
    background:
      linear-gradient(180deg, rgba(255, 253, 248, 0.96), rgba(248, 239, 226, 0.92));
    box-shadow: var(--shadow-panel);
  }

  .chat-shell h3 {
    margin: 0;
    font-family: var(--serif);
    font-size: 26px;
    font-weight: 500;
  }

  .chat-log {
    display: grid;
    gap: 12px;
  }

  .bubble {
    display: grid;
    gap: 8px;
    padding: 14px 16px;
    border-radius: var(--radius-bubble);
    border: 1px solid rgba(216, 200, 178, 0.9);
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 10px 24px rgba(52, 39, 24, 0.04);
    animation: bubble-rise ${uiTokens.motion.chatRevealMs}ms ease;
  }

  .bubble.user {
    margin-left: 16px;
    background: rgba(251, 246, 239, 0.95);
  }

  .bubble.assistant {
    margin-right: 12px;
    background: linear-gradient(180deg, rgba(255, 250, 243, 0.96), rgba(249, 239, 225, 0.94));
  }

  .bubble-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .bubble-copy {
    line-height: 1.72;
    font-size: 16px;
    color: var(--ink);
    white-space: pre-wrap;
  }

  .reply-inspector {
    margin-top: 2px;
    border-top: 1px dashed rgba(216, 200, 178, 0.86);
    padding-top: 8px;
  }

  .reply-inspector summary {
    cursor: pointer;
    color: var(--ink-muted);
    font-size: 13px;
    list-style: none;
  }

  .reply-inspector summary::-webkit-details-marker { display: none; }

  .reply-inspector .meta {
    margin-top: 8px;
  }

  .chat-composer {
    display: grid;
    gap: 12px;
  }

  .chat-composer textarea,
  input,
  textarea,
  select {
    width: 100%;
    border-radius: 18px;
    border: 1px solid rgba(203, 180, 148, 0.92);
    background: rgba(255, 255, 255, 0.96);
    padding: 14px 16px;
    color: var(--ink);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
  }

  .chat-composer textarea {
    min-height: 132px;
    line-height: 1.6;
    resize: vertical;
  }

  .composer-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
  }

  .status-line {
    min-height: 1.4em;
    font-size: 13px;
    color: var(--ink-soft);
  }

  .inline-code {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    border-radius: 10px;
    background: rgba(239, 225, 207, 0.88);
    font-family: var(--mono);
    font-size: 12px;
  }

  .stage-columns {
    display: grid;
    gap: 18px;
  }

  .pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .soft-pill {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    padding: 8px 12px;
    border-radius: var(--radius-pill);
    border: 1px solid rgba(203, 180, 148, 0.88);
    background: rgba(255, 250, 243, 0.88);
    color: var(--accent-deep);
    font-size: 13px;
  }

  .empty-state {
    padding: 18px;
    border-radius: 22px;
    border: 1px dashed rgba(203, 180, 148, 0.9);
    background: rgba(255, 252, 246, 0.82);
    color: var(--ink-muted);
  }

  .review-grid {
    display: grid;
    gap: 18px;
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

  @media (min-width: 768px) {
    .shell {
      padding: 32px 24px 80px;
    }

    .hero {
      grid-template-columns: minmax(0, 1.15fr) minmax(260px, 0.85fr);
      align-items: stretch;
      padding: 28px;
    }

    .stage-columns {
      grid-template-columns: minmax(0, 1.05fr) minmax(280px, 0.95fr);
      align-items: start;
    }

    .mobile-grid.two-up {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .review-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;

const baseClientScript = `
  const API_BASE_URL = ${JSON.stringify(apiBaseUrl())};
  const SESSION_KEY = "hall-of-fame-session";

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
      throw new Error(typeof body?.message === "string" ? body.message : "请求失败");
    }
    return body;
  };

  const ensureAnonymousSession = async () => {
    if (readSession()) {
      return readSession();
    }
    const session = await requestJson("/v1/auth/anonymous", {
      method: "POST",
      body: JSON.stringify({ deviceId: "h5-browser" }),
    });
    writeSession(session);
    return session;
  };

  const renderSession = () => {
    const slot = document.querySelector("[data-session-slot]");
    if (!slot) return;
    const session = readSession();
    if (!session) {
      slot.innerHTML = '<div class="session-banner">你现在还没有身份。进入创建页会先自动领取匿名会话。</div>';
      return;
    }
    slot.innerHTML =
      '<div class="session-banner">当前身份：<strong>' +
      session.role +
      '</strong> / ' +
      session.sessionKind +
      ' / user ' +
      session.userId.slice(0, 8) +
      '</div>';
  };

  window.HallOfFameClient = {
    API_BASE_URL,
    readSession,
    writeSession,
    clearSession,
    requestJson,
    ensureAnonymousSession,
    renderSession,
  };

  window.addEventListener("load", renderSession);
`;

const renderShell = (input: {
  title: string;
  subtitle: string;
  body: string;
  heroAside?: string;
  script?: string;
  eyebrow?: string;
}) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${input.title}</title>
    <style>${pageStyles}</style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div class="hero-head">
          <div class="eyebrow">${input.eyebrow ?? "Hall of Fame"}</div>
          <div class="top-nav">
            <a class="nav-link" href="/">人物馆</a>
            <a class="nav-link" href="/create">创建对象</a>
            <a class="nav-link" href="/review">审核台</a>
          </div>
          <h1 class="hero-title">${input.title}</h1>
          <p class="hero-copy">${input.subtitle}</p>
        </div>
        <div class="hero-strip">
          ${input.heroAside ?? `
            <div class="hero-strip-card">
              <strong>聊天优先</strong>
              <p>先让用户感到自己正在和一个人格对话，再展示系统能力。</p>
            </div>
            <div class="hero-strip-card">
              <strong>移动端优先</strong>
              <p>所有主要路径都先按手机拇指区设计，再扩展到桌面。</p>
            </div>
          `}
        </div>
      </section>
      <div data-session-slot></div>
      ${input.body}
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

const renderQuestionPrompt = (question: string, attrs = "") =>
  `<button type="button" class="prompt-button" data-suggested-question="${escapeHtml(question)}" ${attrs}>${escapeHtml(question)}</button>`;

export const buildFeaturedListBody = (items: FeaturedItem[]) => `
  <div class="stage page-stack">
    <section class="page-stack">
      <p class="section-label">Curated Personas</p>
      <h2 class="page-title">像翻开一本会对话的人物手册</h2>
      <p class="page-subtitle">先从一句问题开始，再看这个人格怎样组织语气、判断和边界。这里不是工具箱，而是一组可以进入的声音。</p>
      <div class="panel panel-muted stack">
        <p class="section-label">Chat-first entry</p>
        <p class="body-copy">先从一句问题开始。每张人物卡只保留最值得开口的线索，不把首页做成卡片货架。</p>
        <div class="pill-row">
          <span class="soft-pill">官方人物</span>
          <span class="soft-pill">分享页可直接开聊</span>
          <span class="soft-pill">移动端优先</span>
        </div>
      </div>
    </section>
    <section class="mobile-grid two-up">
      ${items
        .map(
          (item) => `
            <article class="persona-card">
              <div class="persona-topline">
                <span class="badge">${escapeHtml(item.originType)}</span>
                <a class="button-link secondary" href="/persona/${item.id}">进入对话</a>
              </div>
              <div class="stack">
                <h3 class="persona-name">${escapeHtml(item.displayName)}</h3>
                <p class="persona-intro">${escapeHtml(item.previewIntro ?? "暂无导语")}</p>
              </div>
              <div class="stack">
                <p class="section-label">先从一句问题开始</p>
                <div class="question-list">
                  ${item.recommendedQuestions
                    .slice(0, 2)
                    .map((question) => `<div class="question-slip"><strong>${escapeHtml(question)}</strong></div>`)
                    .join("")}
                </div>
              </div>
            </article>
          `,
        )
        .join("")}
    </section>
  </div>
`;

export const buildPersonaPageBody = (detail: PersonaDetail) => `
  <div class="stage page-stack">
    <section class="stage-columns">
      <div class="chat-stage">
        <section class="chat-shell">
          <span class="badge">${escapeHtml(detail.persona.originType)}</span>
          <div class="stack">
            <p class="section-label">Chat-first persona</p>
            <h2 class="page-title">先让${escapeHtml(detail.persona.displayName)}开口</h2>
            <p class="page-subtitle">${escapeHtml(detail.version.previewIntro ?? "暂无导语")}</p>
          </div>
          <div class="stack">
            <p class="section-label">先从这些问题开始</p>
            <div class="stack">
              ${detail.version.recommendedQuestions
                .slice(0, 3)
                .map((question) => renderQuestionPrompt(question))
                .join("")}
            </div>
          </div>
          <div class="chat-composer">
            <h3>和${escapeHtml(detail.persona.displayName)}聊聊</h3>
            <form data-chat-form class="chat-composer">
              <textarea placeholder="输入一个问题，比如：面对冲突时会先考虑什么？"></textarea>
              <div class="composer-actions">
                <span class="meta">默认是单轮对话，先看这个人格会怎么开口。</span>
                <button type="submit">发送问题</button>
              </div>
            </form>
            <div class="status-line" data-chat-status></div>
            <div class="chat-log" data-chat-log></div>
          </div>
        </section>
      </div>
      <div class="page-stack">
        <section class="panel stack">
          <p class="section-label">人物气质</p>
          <h3 class="card-title">这个人格会怎样组织语言</h3>
          <p class="body-copy">${escapeHtml(detail.version.previewIntro ?? "暂无导语")}</p>
        </section>
        <section class="panel stack">
          <p class="section-label">回答样本</p>
          <div class="question-list">
            ${detail.version.sampleAnswers.map((item) => `<div class="answer-note">${escapeHtml(item)}</div>`).join("")}
          </div>
        </section>
      </div>
    </section>
  </div>
`;

export const buildCreatePageBody = () => `
  <div class="stage page-stack">
    <section class="review-grid">
      <section class="panel stack">
        <p class="section-label">Step 1</p>
        <h3 class="section-title">先给这个人格一个名字</h3>
        <p class="body-copy">名字和蒸馏重点决定了后面的语气骨架。重点可以是“表达、判断、边界”这种词，而不是任务列表。</p>
        <form data-create-form class="stack">
          <input name="displayName" placeholder="对象名称" />
          <input name="distillFocus" placeholder="蒸馏重点，用逗号分隔，例如：表达,判断" />
          <div class="actions">
            <button type="submit">创建对象</button>
            <button type="button" class="secondary" data-upgrade-user>升级为手机号用户</button>
          </div>
        </form>
        <div class="status-line" data-create-status></div>
      </section>
      <section class="panel stack">
        <p class="section-label">Step 2</p>
        <h3 class="section-title">喂给它足够说话的材料</h3>
        <p class="meta">当前 persona: <span data-persona-id>未创建</span></p>
        <form data-text-source-form class="stack">
          <input name="title" placeholder="文本资料标题" />
          <select name="sourceKind">
            <option value="PRIMARY">PRIMARY</option>
            <option value="SECONDARY">SECONDARY</option>
            <option value="SUMMARY">SUMMARY</option>
          </select>
          <textarea name="content" placeholder="粘贴文本资料"></textarea>
          <button type="submit">添加文本资料</button>
        </form>
        <form data-url-source-form class="stack">
          <input name="url" placeholder="公开网页 URL" />
          <input name="title" placeholder="可选标题" />
          <select name="sourceKind">
            <option value="PRIMARY">PRIMARY</option>
            <option value="SECONDARY">SECONDARY</option>
            <option value="SUMMARY">SUMMARY</option>
          </select>
          <button type="submit">添加 URL 资料</button>
        </form>
        <div class="actions">
          <button type="button" class="ok" data-open-preview>蒸馏并进入预览页</button>
        </div>
        <div class="status-line" data-source-status></div>
      </section>
    </section>
    <section class="panel stack">
      <p class="section-label">Source notebook</p>
      <h3 class="section-title">当前资料</h3>
      <ul class="question-list" data-source-list><li class="empty-state">暂无资料</li></ul>
    </section>
  </div>
`;

export const buildReviewPageBody = () => `
  <div class="stage page-stack">
    <section class="panel stack">
      <p class="section-label">Reviewer session</p>
      <h3 class="section-title">切换到 reviewer 身份</h3>
      <div class="actions">
        <button type="button" data-reviewer-login>进入 reviewer 身份</button>
        <button type="button" class="secondary" data-clear-session>清除当前身份</button>
      </div>
      <div class="status-line" data-reviewer-status></div>
    </section>
    <section class="review-grid">
      <section class="panel stack">
        <p class="section-label">Source review</p>
        <h3 class="section-title">资料审核</h3>
        <ul class="question-list" data-source-review-list><li class="empty-state">请先登录 reviewer</li></ul>
      </section>
      <section class="panel stack">
        <p class="section-label">Publish review</p>
        <h3 class="section-title">发布审核</h3>
        <ul class="question-list" data-version-review-list><li class="empty-state">请先登录 reviewer</li></ul>
      </section>
    </section>
  </div>
`;

const renderFeaturedList = async () => {
  const featured = await fetchJson<{ items: FeaturedItem[] }>("/v1/personae/featured");
  const items = featured?.items ?? [];

  return renderShell({
    title: "Hall of Fame",
    subtitle: "每一个入口都先服务聊天，再服务功能。你看到的不是一组 AI 卡片，而是一排可以走进去的声音。",
    eyebrow: "Mobile-first persona hall",
    heroAside: `
      <div class="hero-strip-card">
        <strong>像一本随手翻开的对话册</strong>
        <p>首页只保留足够让你开口的线索，不用在一开始就承受系统复杂度。</p>
      </div>
      <div class="hero-strip-card">
        <strong>人物先于功能</strong>
        <p>创建、审核和分享都存在，但它们只能围绕“和这个人格说话”来服务。</p>
      </div>
    `,
    body: buildFeaturedListBody(items),
  });
};

const renderChatScript = (input: {
  targetType: "published_persona" | "draft_version_preview" | "share_link";
  targetValue: string;
}) => `
  const form = document.querySelector("[data-chat-form]");
  const log = document.querySelector("[data-chat-log]");
  const status = document.querySelector("[data-chat-status]");
  const promptButtons = document.querySelectorAll("[data-suggested-question]");
  let chatId = null;

  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const buildReplyInspectorHtml = (reply) => {
    const parts = [];
    const summary = reply?.basisSummary?.summary?.trim?.();
    if (summary) parts.push(summary);
    if (reply?.conflictDetected) parts.push("当前答案主动避开了彼此冲突的材料。");
    if (!parts.length) return "";
    return '<details class="reply-inspector"><summary>这句话怎么来的</summary><div class="meta">' + escapeHtml(parts.join(" ")) + '</div></details>';
  };

  const appendBubble = (role, content, metaHtml) => {
    const bubble = document.createElement("div");
    bubble.className = "bubble " + (role === "ASSISTANT" ? "assistant" : "user");
    bubble.innerHTML =
      '<div class="bubble-label">' + (role === "ASSISTANT" ? "Persona" : "You") + '</div>' +
      '<div class="bubble-copy">' + escapeHtml(content) + '</div>' +
      (metaHtml || "");
    log.appendChild(bubble);
  };

  promptButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const textarea = form?.querySelector("textarea");
      if (!textarea) return;
      textarea.value = button.getAttribute("data-suggested-question") || "";
      textarea.focus();
    });
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = form.querySelector("textarea");
    const content = input.value.trim();
    if (!content) return;
    status.textContent = "正在等这个人格开口…";
    try {
      if (!chatId) {
        const payload = ${input.targetType === "published_persona"
          ? `{ targetType: "published_persona", personaId: "${input.targetValue}" }`
          : input.targetType === "draft_version_preview"
            ? `{ targetType: "draft_version_preview", personaVersionId: "${input.targetValue}" }`
            : `{ targetType: "share_link", shareSlug: "${input.targetValue}" }`};
        const created = await HallOfFameClient.requestJson("/v1/chats", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        chatId = created.id;
      }

      appendBubble("USER", content);
      const reply = await HallOfFameClient.requestJson("/v1/chats/" + chatId + "/messages", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      appendBubble("ASSISTANT", reply.content, buildReplyInspectorHtml(reply));
      input.value = "";
      status.textContent = "这个人格已经回话。";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    }
  });
`;

const renderPersonaPage = async (personaId: string) => {
  const detail = await fetchJson<PersonaDetail>(`/v1/personae/${personaId}`);

  if (!detail) {
    return renderShell({
      title: "对象不存在",
      subtitle: "没有找到对应对象。",
      body: '<div class="empty-state">请返回首页重新选择对象。</div>',
    });
  }

  return renderShell({
    title: detail.persona.displayName,
    subtitle: detail.version.previewIntro ?? "暂无导语",
    eyebrow: "Persona conversation",
    heroAside: `
      <div class="hero-strip-card">
        <strong>先从问题进入</strong>
        <p>不用先理解所有设定，先问一句，再从回话里感受这个人格。</p>
      </div>
      <div class="hero-strip-card">
        <strong>解释层默认隐藏</strong>
        <p>系统不会打断聊天，只在你愿意的时候再展开“这句话怎么来的”。</p>
      </div>
    `,
    body: buildPersonaPageBody(detail),
    script: renderChatScript({
      targetType: "published_persona",
      targetValue: personaId,
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
      subtitle: "这个分享链接没有命中可用版本。",
      body: '<div class="empty-state">请确认 share slug 是否正确。</div>',
    });
  }

  return renderShell({
    title: `${landing.persona.displayName} 分享页`,
    subtitle: landing.version.previewIntro ?? "基于已发布版本的分享入口。",
    eyebrow: "Shared conversation",
    heroAside: `
      <div class="hero-strip-card">
        <strong>最快进入聊天的入口</strong>
        <p>分享页比人物页更轻，只保留足够让你开口的引导。</p>
      </div>
      <div class="hero-strip-card">
        <strong>版本已冻结</strong>
        <p>当前对话来自固定版本。<span class="inline-code">${escapeHtml(landing.share.shareSlug)}</span></p>
      </div>
    `,
    body: `
      <div class="stage page-stack">
        <section class="stage-columns">
          <section class="chat-shell">
            <span class="badge">${escapeHtml(landing.persona.originType)}</span>
            <div class="stack">
              <p class="section-label">Share entry</p>
              <h2 class="page-title">先从一轮对话认识${escapeHtml(landing.persona.displayName)}</h2>
              <p class="page-subtitle">${escapeHtml(landing.version.previewIntro ?? "基于已发布版本的分享入口。")}</p>
            </div>
            <div class="stack">
              <p class="section-label">可以这样开口</p>
              <div class="stack">
                ${landing.version.recommendedQuestions.slice(0, 3).map((question) => renderQuestionPrompt(question)).join("")}
              </div>
            </div>
            <form data-chat-form class="chat-composer">
              <textarea placeholder="从分享页直接开聊"></textarea>
              <div class="composer-actions">
                <span class="meta">这是一条面向分享场景的单轮对话入口。</span>
                <button type="submit">开始对话</button>
              </div>
            </form>
            <div class="status-line" data-chat-status></div>
            <div class="chat-log" data-chat-log></div>
          </section>
          <section class="panel stack">
            <p class="section-label">Share details</p>
            <p class="body-copy">如果你只是想感受这个人格如何回话，分享页应该比完整人物页更轻、更快、更像一个邀请。</p>
            <p class="meta">canonical: <span class="inline-code">${escapeHtml(landing.share.canonicalUrl)}</span></p>
          </section>
        </section>
      </div>
    `,
    script: renderChatScript({
      targetType: "share_link",
      targetValue: shareSlug,
    }),
  });
};

const renderCreatePage = () =>
  renderShell({
    title: "塑造一个能开口的人格",
    subtitle: "创建不是填工单，而是先给这个对象一个名字、一条主线，再把资料慢慢送进去，让它具备稳定的口吻与判断框架。",
    eyebrow: "Create persona",
    heroAside: `
      <div class="hero-strip-card">
        <strong>一步一步来</strong>
        <p>先命名，再喂资料，再蒸馏预览。流程不短，但每一步都应该像在塑造一个人。</p>
      </div>
      <div class="hero-strip-card">
        <strong>会话自动领取</strong>
        <p>进入页面后先领取匿名会话，你可以稍后再升级成手机号身份。</p>
      </div>
    `,
    body: buildCreatePageBody(),
    script: `
      const createStatus = document.querySelector("[data-create-status]");
      const sourceStatus = document.querySelector("[data-source-status]");
      const personaSlot = document.querySelector("[data-persona-id]");
      const sourceList = document.querySelector("[data-source-list]");
      const search = new URLSearchParams(window.location.search);
      let personaId = search.get("personaId") || localStorage.getItem("hall-of-fame-current-persona");

      const renderPersonaId = () => {
        personaSlot.textContent = personaId || "未创建";
      };

      const refreshSources = async () => {
        renderPersonaId();
        if (!personaId) {
          sourceList.innerHTML = "<li class='empty-state'>暂无资料</li>";
          return;
        }

        try {
          const result = await HallOfFameClient.requestJson("/v1/personae/" + personaId + "/sources");
          const items = result.items || [];
          sourceList.innerHTML = items.length
            ? items.map((item) => "<li class='source-item'><strong>" + (item.sourceTitle || item.id) + "</strong><div class='meta'>" + item.inputType + " / " + item.sourceKind + " / " + item.reviewStatus + "</div><p class='body-copy'>" + (item.sourceSummary || "") + "</p></li>").join("")
            : "<li class='empty-state'>暂无资料</li>";
        } catch (error) {
          sourceList.innerHTML = "<li class='empty-state'>" + (error instanceof Error ? error.message : String(error)) + "</li>";
        }
      };

      const ensureSessionAndLoad = async () => {
        await HallOfFameClient.ensureAnonymousSession();
        await refreshSources();
      };

      document.querySelector("[data-create-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        createStatus.textContent = "正在为这个人格建立骨架…";
        try {
          const result = await HallOfFameClient.requestJson("/v1/personae", {
            method: "POST",
            body: JSON.stringify({
              displayName: String(form.get("displayName") || ""),
              personaType: "ORIGINAL_PERSONA",
              originType: "USER",
              distillFocus: String(form.get("distillFocus") || "").split(",").map((item) => item.trim()).filter(Boolean),
            }),
          });
          personaId = result.id;
          localStorage.setItem("hall-of-fame-current-persona", personaId);
          createStatus.textContent = "对象已经创建，可以继续补资料。";
          await refreshSources();
        } catch (error) {
          createStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      document.querySelector("[data-text-source-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!personaId) {
          sourceStatus.textContent = "请先创建对象";
          return;
        }
        const form = new FormData(event.currentTarget);
        sourceStatus.textContent = "正在记录文本资料…";
        try {
          await HallOfFameClient.requestJson("/v1/personae/" + personaId + "/sources/text", {
            method: "POST",
            body: JSON.stringify({
              title: String(form.get("title") || ""),
              sourceKind: String(form.get("sourceKind") || "PRIMARY"),
              content: String(form.get("content") || ""),
            }),
          });
          sourceStatus.textContent = "文本资料已加入当前对象。";
          event.currentTarget.reset();
          await refreshSources();
        } catch (error) {
          sourceStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      document.querySelector("[data-url-source-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!personaId) {
          sourceStatus.textContent = "请先创建对象";
          return;
        }
        const form = new FormData(event.currentTarget);
        sourceStatus.textContent = "URL 已送去处理…";
        try {
          await HallOfFameClient.requestJson("/v1/personae/" + personaId + "/sources/url", {
            method: "POST",
            body: JSON.stringify({
              url: String(form.get("url") || ""),
              title: String(form.get("title") || ""),
              sourceKind: String(form.get("sourceKind") || "PRIMARY"),
            }),
          });
          sourceStatus.textContent = "URL 资料已提交到 worker。";
          event.currentTarget.reset();
          await refreshSources();
        } catch (error) {
          sourceStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      document.querySelector("[data-open-preview]")?.addEventListener("click", async () => {
        if (!personaId) {
          sourceStatus.textContent = "请先创建对象";
          return;
        }
        sourceStatus.textContent = "正在蒸馏这个人格…";
        try {
          const version = await HallOfFameClient.requestJson("/v1/personae/" + personaId + "/distill", {
            method: "POST",
          });
          window.location.href = "/preview/" + version.id;
        } catch (error) {
          sourceStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      document.querySelector("[data-upgrade-user]")?.addEventListener("click", async () => {
        createStatus.textContent = "正在升级身份…";
        try {
          const session = await HallOfFameClient.requestJson("/v1/auth/web/sms/verify", {
            method: "POST",
            body: JSON.stringify({
              phoneNumber: "13800000000",
              code: "123456",
            }),
          });
          HallOfFameClient.writeSession(session);
          createStatus.textContent = "已经升级为手机号用户。";
        } catch (error) {
          createStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      void ensureSessionAndLoad();
    `,
  });

const renderPreviewPage = async (personaVersionId: string) =>
  renderShell({
    title: "在发布前，先听它自己说一轮",
    subtitle: "预览页的目标不是看分数，而是确认这个人格已经有稳定的语气、判断和边界，再决定要不要公开出去。",
    eyebrow: "Preview before publish",
    heroAside: `
      <div class="hero-strip-card">
        <strong>预览优先</strong>
        <p>先和预览版本聊一轮，再看分数和发布动作，不要反过来。</p>
      </div>
      <div class="hero-strip-card">
        <strong>发布是第二层动作</strong>
        <p>如果人格还没有活起来，就不该急着把它送进审核。</p>
      </div>
    `,
    body: `
      <div class="stage page-stack">
        <section class="stage-columns">
          <section class="chat-shell">
            <p class="section-label">Preview chat</p>
            <h2 class="page-title">先听听它会怎么回答</h2>
            <p class="page-subtitle">这里走 preview chat，只对当前草稿版本生效。</p>
            <form data-chat-form class="chat-composer">
              <textarea placeholder="这里走 draft preview chat"></textarea>
              <div class="composer-actions">
                <span class="meta">预览阶段建议多问几类问题，先看人格是否稳定。</span>
                <button type="submit">发送预览问题</button>
              </div>
            </form>
            <div class="status-line" data-chat-status></div>
            <div class="chat-log" data-chat-log></div>
          </section>
          <section class="page-stack">
            <section class="panel stack">
              <p class="section-label">Version summary</p>
              <h3 class="section-title">版本信息</h3>
              <div data-version-summary class="body-copy">加载中...</div>
              <div class="actions">
                <button type="button" data-submit-publish>提交发布审核</button>
                <a class="button-link secondary" href="/create">返回创建页</a>
              </div>
              <div class="status-line" data-preview-status></div>
            </section>
            <section class="panel stack">
              <p class="section-label">Suggested openings</p>
              <ul class="question-list" data-preview-questions><li class="empty-state">加载中...</li></ul>
            </section>
            <section class="panel stack">
              <p class="section-label">Sample voice</p>
              <ul class="question-list" data-preview-answers><li class="empty-state">加载中...</li></ul>
            </section>
          </section>
        </section>
      </div>
    `,
    script: `
      const versionId = ${JSON.stringify(personaVersionId)};
      const summarySlot = document.querySelector("[data-version-summary]");
      const questionsSlot = document.querySelector("[data-preview-questions]");
      const answersSlot = document.querySelector("[data-preview-answers]");
      const previewStatus = document.querySelector("[data-preview-status]");

      const loadVersion = async () => {
        await HallOfFameClient.ensureAnonymousSession();
        try {
          const version = await HallOfFameClient.requestJson("/v1/persona-versions/" + versionId, {
            method: "GET",
          });
          summarySlot.textContent = "状态：" + version.status + " / coverage " + version.coverageScore + " / grounding " + version.groundingScore + " / risk " + version.riskScore;
          questionsSlot.innerHTML = version.recommendedQuestions.map((item) => "<li class='question-slip'>" + item + "</li>").join("");
          answersSlot.innerHTML = version.sampleAnswers.map((item) => "<li class='answer-note'>" + item + "</li>").join("");
        } catch (error) {
          summarySlot.textContent = error instanceof Error ? error.message : String(error);
        }
      };

      document.querySelector("[data-submit-publish]")?.addEventListener("click", async () => {
        previewStatus.textContent = "正在提交发布审核…";
        try {
          const version = await HallOfFameClient.requestJson("/v1/persona-versions/" + versionId + "/submit-publish-review", {
            method: "POST",
            body: JSON.stringify({}),
          });
          previewStatus.textContent = "已提交，当前状态：" + version.status + "。请到审核台审批。";
        } catch (error) {
          previewStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      void loadVersion();
    ` + renderChatScript({
      targetType: "draft_version_preview",
      targetValue: personaVersionId,
    }),
  });

const renderReviewPage = () =>
  renderShell({
    title: "审核台",
    subtitle: "这块可以更功能化，但仍然要保留同一套暖色、轻边框和稳定节奏。它是人工判断的工作面，不是系统警报墙。",
    eyebrow: "Reviewer console",
    heroAside: `
      <div class="hero-strip-card">
        <strong>人工兜底</strong>
        <p>资料审核和发布审核都留在人手里，界面应当清楚，但不能变成冷硬控制台。</p>
      </div>
      <div class="hero-strip-card">
        <strong>系统退后</strong>
        <p>运营工具可以更直接，但仍然不该污染主产品的情绪基调。</p>
      </div>
    `,
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
          ? sourceQueue.items.map((item) => "<li class='queue-item'><strong>" + (item.sourceTitle || item.sourceId) + "</strong><div class='meta'>" + item.displayName + " / " + item.sourceKind + "</div><p class='body-copy'>" + (item.sourceSummary || "") + "</p><div class='actions'><button class='ok' data-source-approve='" + item.sourceId + "'>通过</button><button class='danger' data-source-reject='" + item.sourceId + "'>拒绝</button></div></li>").join("")
          : "<li class='empty-state'>当前没有待审资料</li>";

        versionList.innerHTML = (versionQueue.items || []).length
          ? versionQueue.items.map((item) => "<li class='queue-item'><strong>" + item.displayName + " v" + item.versionNumber + "</strong><div class='meta'>" + (item.previewIntro || "") + "</div><div class='meta'>coverage " + item.coverageScore + " / grounding " + item.groundingScore + " / risk " + item.riskScore + "</div><div class='actions'><button class='ok' data-version-approve='" + item.personaVersionId + "'>发布</button><button class='danger' data-version-reject='" + item.personaVersionId + "'>驳回</button></div></li>").join("")
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
  app.get<{ Params: { personaId: string } }>("/persona/:personaId", async (request, reply) =>
    sendHtml(reply, await renderPersonaPage(request.params.personaId)),
  );
  app.get<{ Params: { shareSlug: string } }>("/share/:shareSlug", async (request, reply) =>
    sendHtml(reply, await renderSharePage(request.params.shareSlug)),
  );
  app.get("/create", async (_request, reply) => sendHtml(reply, renderCreatePage()));
  app.get<{ Params: { personaVersionId: string } }>("/preview/:personaVersionId", async (request, reply) =>
    sendHtml(reply, await renderPreviewPage(request.params.personaVersionId)),
  );
  app.get("/review", async (_request, reply) => sendHtml(reply, renderReviewPage()));

  return app;
};

export { buildReplyInspectorHtml };
