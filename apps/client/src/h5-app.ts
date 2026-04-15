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
      radial-gradient(circle at top right, rgba(209, 161, 180, 0.18), transparent 26rem),
      radial-gradient(circle at 20% 15%, rgba(127, 93, 153, 0.16), transparent 20rem),
      linear-gradient(180deg, #140f19 0%, var(--bg) 48%, #120f17 100%);
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
      linear-gradient(to right, rgba(209, 161, 180, 0.03) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(209, 161, 180, 0.02) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: linear-gradient(180deg, rgba(0,0,0,0.4), transparent 88%);
  }

  .stage {
    display: grid;
    gap: 24px;
  }

  .hero {
    position: relative;
    display: grid;
    gap: 14px;
    padding: 20px 18px 12px;
    border: 1px solid rgba(109, 90, 120, 0.72);
    border-radius: 32px;
    background:
      linear-gradient(160deg, rgba(40, 31, 47, 0.96), rgba(27, 21, 33, 0.96)),
      var(--bg-raised);
    box-shadow: var(--shadow-panel);
    backdrop-filter: blur(18px);
  }

  .hero::after {
    content: "";
    position: absolute;
    inset: -12% -10% auto auto;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(209, 161, 180, 0.22), transparent 72%);
  }

  .hero-head {
    display: grid;
    gap: 10px;
    max-width: 34rem;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    padding: 6px 12px;
    border-radius: var(--radius-pill);
    background: rgba(209, 161, 180, 0.12);
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
    font-size: 15px;
    line-height: 1.6;
    max-width: 24rem;
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
    background: rgba(34, 27, 41, 0.78);
    border-color: rgba(109, 90, 120, 0.78);
    color: var(--ink-muted);
  }

  .button-link.primary,
  button {
    background: linear-gradient(180deg, var(--accent), var(--accent-deep));
    color: #1c141b;
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
    margin-top: -6px;
    width: fit-content;
    max-width: 100%;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid rgba(109, 90, 120, 0.42);
    background: rgba(31, 25, 37, 0.58);
    color: var(--ink-soft);
    font-size: 12px;
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
    border: 1px solid rgba(109, 90, 120, 0.56);
    background: rgba(33, 26, 38, 0.92);
    box-shadow: var(--shadow-card);
  }

  .panel-muted {
    background: rgba(38, 30, 45, 0.88);
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
    background: rgba(209, 161, 180, 0.12);
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
    border: 1px solid rgba(109, 90, 120, 0.64);
    background:
      linear-gradient(180deg, rgba(35, 27, 42, 0.96), rgba(27, 21, 33, 0.94));
    box-shadow: var(--shadow-card);
  }

  .persona-card::after {
    content: "";
    position: absolute;
    inset: auto -24px -28px auto;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(209, 161, 180, 0.16), transparent 72%);
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
    border: 1px solid rgba(109, 90, 120, 0.5);
    background: rgba(41, 32, 48, 0.82);
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

  .prompt-cluster {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .question-slip button,
  .question-slip .button-link,
  .prompt-button {
    background: transparent;
    color: var(--accent);
    border: 1px solid rgba(109, 90, 120, 0.72);
    box-shadow: none;
    min-height: 40px;
  }

  .prompt-button {
    justify-content: flex-start;
    width: auto;
    max-width: 100%;
    min-height: 38px;
    padding: 9px 14px;
    background: rgba(45, 34, 52, 0.9);
    text-align: left;
    border-radius: 999px;
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
    border: 1px solid rgba(109, 90, 120, 0.76);
    background:
      linear-gradient(180deg, rgba(35, 27, 42, 0.98), rgba(26, 20, 31, 0.96));
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
    padding: 6px 0 2px;
  }

  .bubble {
    display: grid;
    gap: 8px;
    padding: 14px 16px;
    border-radius: var(--radius-bubble);
    border: 1px solid rgba(122, 104, 135, 0.58);
    box-shadow: 0 12px 28px rgba(5, 3, 9, 0.26);
    animation: bubble-rise ${uiTokens.motion.chatRevealMs}ms ease;
    max-width: 88%;
  }

  .bubble.user {
    margin-left: auto;
    background: linear-gradient(180deg, rgba(95, 63, 88, 0.96), rgba(71, 47, 67, 0.94));
  }

  .bubble.assistant {
    margin-right: auto;
    background: linear-gradient(180deg, rgba(52, 41, 63, 0.98), rgba(39, 31, 48, 0.96));
  }

  .bubble-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #ddb8c8;
  }

  .bubble-copy {
    line-height: 1.72;
    font-size: 16px;
    color: #f3e9df;
    white-space: pre-wrap;
  }

  .reply-inspector {
    margin-top: 2px;
    border-top: 1px dashed rgba(109, 90, 120, 0.6);
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
    border: 1px solid rgba(109, 90, 120, 0.78);
    background: rgba(25, 20, 31, 0.96);
    padding: 14px 16px;
    color: var(--ink);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .chat-composer textarea {
    min-height: 104px;
    line-height: 1.6;
    resize: vertical;
  }

  .composer-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
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
    background: rgba(56, 42, 54, 0.9);
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
    border: 1px solid rgba(109, 90, 120, 0.72);
    background: rgba(42, 31, 49, 0.86);
    color: var(--accent);
    font-size: 13px;
  }

  .empty-state {
    padding: 18px;
    border-radius: 22px;
    border: 1px dashed rgba(109, 90, 120, 0.68);
    background: rgba(32, 25, 38, 0.76);
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
	    slot.innerHTML = ${"buildSessionBannerHtml(session)"};
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
  body: string;
  subtitle?: string;
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
          ${input.eyebrow ? `<div class="eyebrow">${input.eyebrow}</div>` : ""}
          <div class="top-nav">
            <a class="nav-link" href="/">人物馆</a>
            <a class="nav-link" href="/create">创建对象</a>
            <a class="nav-link" href="/review">审核台</a>
          </div>
          <h1 class="hero-title">${input.title}</h1>
          ${input.subtitle ? `<p class="hero-copy">${input.subtitle}</p>` : ""}
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

export const buildSessionBannerHtml = (session: { role?: string | null; sessionKind?: string | null; userId?: string | null } | null) => {
  if (!session) {
    return '<div class="session-banner">进入创建页时会先替你领一枚匿名会话。</div>';
  }

  if (session.role === "REVIEWER") {
    return '<div class="session-banner">reviewer 身份已启用。</div>';
  }

  if (session.role === "USER") {
    return '<div class="session-banner">你的会话已经连上了。</div>';
  }

  return '<div class="session-banner">匿名会话已就绪。</div>';
};

const renderStaticBubble = (role: "assistant" | "user", label: string, content: string) => `
  <div class="bubble ${role}">
    <div class="bubble-label">${escapeHtml(label)}</div>
    <div class="bubble-copy">${escapeHtml(content)}</div>
  </div>
`;

export const buildFeaturedListBody = (items: FeaturedItem[]) => `
  <div class="stage page-stack">
    <section class="chat-shell">
      <div class="chat-log">
        ${renderStaticBubble("assistant", "Persona", "今晚不必急着解释自己。你先问一句，我会顺着那句话靠近你。")}
        ${renderStaticBubble("user", "You", "我该先去找谁聊聊？")}
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
              <div class="prompt-cluster">
                ${item.recommendedQuestions
                  .slice(0, 1)
                  .map((question) => `<div class="question-slip"><strong>${escapeHtml(question)}</strong></div>`)
                  .join("")}
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
    <section class="chat-shell">
      <span class="badge">${escapeHtml(detail.persona.originType)}</span>
      <p class="page-subtitle">${escapeHtml(detail.version.previewIntro ?? "暂无导语")}</p>
      <div class="chat-log" data-chat-log>
        ${renderStaticBubble("assistant", "Persona", detail.version.sampleAnswers[0] ?? detail.version.previewIntro ?? "先开口吧。")}
        ${renderStaticBubble("user", "You", detail.version.recommendedQuestions[0] ?? "如果现在要开口，你会先说什么？")}
      </div>
      <div class="prompt-cluster">
        ${detail.version.recommendedQuestions
          .slice(0, 3)
          .map((question) => renderQuestionPrompt(question))
          .join("")}
      </div>
      <div class="chat-composer">
        <form data-chat-form class="chat-composer">
          <textarea placeholder="输入一个问题，比如：面对冲突时会先考虑什么？"></textarea>
          <div class="composer-actions">
            <button type="submit">发送问题</button>
          </div>
        </form>
        <div class="status-line" data-chat-status></div>
      </div>
    </section>
  </div>
`;

export const buildCreatePageBody = () => `
  <div class="stage page-stack">
    <section class="review-grid">
      <section class="panel stack">
        <h3 class="section-title">先给这个人格一个名字</h3>
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
      <h3 class="section-title">资料簿</h3>
      <ul class="question-list" data-source-list><li class="empty-state">暂无资料</li></ul>
    </section>
  </div>
`;

export const buildReviewPageBody = () => `
  <div class="stage page-stack">
    <section class="panel stack">
      <h3 class="section-title">切换 reviewer 身份</h3>
      <div class="actions">
        <button type="button" data-reviewer-login>进入 reviewer 身份</button>
        <button type="button" class="secondary" data-clear-session>清除当前身份</button>
      </div>
      <div class="status-line" data-reviewer-status></div>
    </section>
    <section class="review-grid">
      <section class="panel stack">
        <h3 class="section-title">待审资料</h3>
        <ul class="question-list" data-source-review-list><li class="empty-state">请先登录 reviewer</li></ul>
      </section>
      <section class="panel stack">
        <h3 class="section-title">待审发布</h3>
        <ul class="question-list" data-version-review-list><li class="empty-state">请先登录 reviewer</li></ul>
      </section>
    </section>
  </div>
`;

const renderFeaturedList = async () => {
  const featured = await fetchJson<{ items: FeaturedItem[] }>("/v1/personae/featured");
  const items = featured?.items ?? [];

  return renderShell({
    title: "把一句问题轻轻交给另一个人格。",
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
      body: '<div class="empty-state">请返回首页重新选择对象。</div>',
    });
  }

  return renderShell({
    title: `先让${detail.persona.displayName}开口`,
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
      body: '<div class="empty-state">请确认 share slug 是否正确。</div>',
    });
  }

  return renderShell({
    title: `直接和${landing.persona.displayName}聊`,
    body: `
      <div class="stage page-stack">
        <section class="chat-shell">
          <span class="badge">${escapeHtml(landing.persona.originType)}</span>
          <div class="stack">
            <p class="page-subtitle">${escapeHtml(landing.version.previewIntro ?? "基于已发布版本的分享入口。")}</p>
          </div>
          <div class="chat-log" data-chat-log>
            ${renderStaticBubble("assistant", "Persona", landing.version.previewIntro ?? "先问一句。")}
          </div>
          <div class="prompt-cluster">
            ${landing.version.recommendedQuestions.slice(0, 3).map((question) => renderQuestionPrompt(question)).join("")}
          </div>
          <form data-chat-form class="chat-composer">
            <textarea placeholder="从分享页直接开聊"></textarea>
            <div class="composer-actions">
              <button type="submit">开始对话</button>
            </div>
          </form>
          <div class="status-line" data-chat-status></div>
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
    title: "塑造一个会开口的人格",
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
    title: "先听它开口",
    body: `
      <div class="stage page-stack">
        <section class="stage-columns">
          <section class="chat-shell">
            <p class="page-subtitle">先听一轮，再决定要不要公开。</p>
            <div class="chat-log" data-chat-log>
              ${renderStaticBubble("assistant", "Persona", "如果这句话还不够像它，就不要急着发布。")}
            </div>
            <form data-chat-form class="chat-composer">
              <textarea placeholder="这里走 draft preview chat"></textarea>
              <div class="composer-actions">
                <button type="submit">发送预览问题</button>
              </div>
            </form>
            <div class="status-line" data-chat-status></div>
          </section>
          <section class="page-stack">
            <section class="panel stack">
              <h3 class="section-title">版本信息</h3>
              <div data-version-summary class="body-copy">加载中...</div>
              <div class="actions">
                <button type="button" data-submit-publish>提交发布审核</button>
                <a class="button-link secondary" href="/create">返回创建页</a>
              </div>
              <div class="status-line" data-preview-status></div>
            </section>
            <section class="panel stack">
              <h3 class="section-title">建议开场</h3>
              <ul class="question-list" data-preview-questions><li class="empty-state">加载中...</li></ul>
            </section>
            <section class="panel stack">
              <h3 class="section-title">声音样本</h3>
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
