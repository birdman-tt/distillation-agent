import Fastify from "fastify";

const apiBaseUrl = () => process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";

const pageStyles = `
  :root {
    --bg: #f6f0e7;
    --panel: #fffdf8;
    --line: #d8c8b2;
    --ink: #1f1a14;
    --muted: #6b5c4b;
    --accent: #9b5c2e;
    --accent-soft: #efe1cf;
    --danger: #9c2f2f;
    --ok: #296748;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    background:
      radial-gradient(circle at top right, rgba(155, 92, 46, 0.08), transparent 28rem),
      linear-gradient(180deg, #fbf7f0 0%, var(--bg) 100%);
    color: var(--ink);
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .shell { max-width: 1180px; margin: 0 auto; padding: 32px 24px 56px; }
  .hero {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 28px;
    padding: 24px 28px;
    border: 1px solid var(--line);
    border-radius: 24px;
    background: rgba(255, 253, 248, 0.85);
    backdrop-filter: blur(8px);
  }
  .hero h1 { margin: 0 0 12px; font-size: 40px; line-height: 1; }
  .hero p { margin: 0; max-width: 48rem; color: var(--muted); line-height: 1.6; }
  .nav {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .nav a, .nav button {
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink);
    cursor: pointer;
    font: inherit;
  }
  .grid { display: grid; gap: 20px; }
  .grid.two { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
  .card {
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--panel);
    padding: 20px;
    box-shadow: 0 18px 36px rgba(31, 26, 20, 0.06);
  }
  .card h2, .card h3 { margin-top: 0; }
  .meta { color: var(--muted); font-size: 14px; }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 13px;
  }
  .stack { display: grid; gap: 14px; }
  .list { display: grid; gap: 12px; padding: 0; list-style: none; }
  .list li {
    padding: 14px;
    border: 1px solid rgba(216, 200, 178, 0.8);
    border-radius: 14px;
    background: #fffaf3;
  }
  form { display: grid; gap: 12px; }
  input, textarea, select {
    width: 100%;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: #fff;
    color: var(--ink);
    font: inherit;
  }
  textarea { min-height: 110px; resize: vertical; }
  button {
    border: none;
    border-radius: 14px;
    padding: 12px 16px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    cursor: pointer;
  }
  button.secondary {
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--line);
  }
  button.danger { background: var(--danger); }
  button.ok { background: var(--ok); }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .session {
    padding: 12px 14px;
    border-radius: 16px;
    background: #efe6d8;
    color: var(--muted);
    font-size: 14px;
  }
  .chat-log { display: grid; gap: 10px; }
  .bubble {
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: #fff;
  }
  .bubble.assistant { background: #fcf6ed; }
  .bubble small { display: block; margin-top: 8px; color: var(--muted); }
  .status-line { font-size: 14px; color: var(--muted); min-height: 1.4em; }
  code.inline { padding: 2px 6px; border-radius: 8px; background: #efe6d8; }
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
    if (!slot) {
      return;
    }
    const session = readSession();
    if (!session) {
      slot.innerHTML = '<div class="session">当前没有会话。进入创建页会自动领取匿名会话。</div>';
      return;
    }
    slot.innerHTML = '<div class="session">当前身份：<strong>' + session.role + '</strong> / ' + session.sessionKind + ' / user ' + session.userId.slice(0, 8) + '</div>';
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
  script?: string;
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
        <div>
          <h1>${input.title}</h1>
          <p>${input.subtitle}</p>
        </div>
        <div class="nav">
          <a href="/">人物馆</a>
          <a href="/create">创建对象</a>
          <a href="/review">审核台</a>
        </div>
      </section>
      <div data-session-slot></div>
      ${input.body}
    </div>
    <script>${baseClientScript}</script>
    <script>${input.script ?? ""}</script>
  </body>
</html>`;

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

const renderFeaturedList = async () => {
  const featured = await fetchJson<{ items: Array<{ id: string; displayName: string; previewIntro: string | null; recommendedQuestions: string[]; originType: string }> }>("/v1/personae/featured");
  const items = featured?.items ?? [];
  const body = `
    <div class="grid two">
      ${items
        .map(
          (item) => `
        <article class="card stack">
          <div class="badge">${item.originType}</div>
          <div>
            <h2>${item.displayName}</h2>
            <p class="meta">${item.previewIntro ?? "暂无导语"}</p>
          </div>
          <ul class="list">
            ${item.recommendedQuestions.map((question) => `<li>${question}</li>`).join("")}
          </ul>
          <div class="actions">
            <a href="/persona/${item.id}">进入对象页</a>
          </div>
        </article>`,
        )
        .join("")}
    </div>
  `;

  return renderShell({
    title: "Hall of Fame",
    subtitle: "官方人物馆、分享页、创建页和审核台都在这套 H5 本地服务里，方便直接看产品闭环。",
    body,
  });
};

const renderChatScript = (input: {
  targetType: "published_persona" | "draft_version_preview" | "share_link";
  targetValue: string;
}) => `
  const form = document.querySelector("[data-chat-form]");
  const log = document.querySelector("[data-chat-log]");
  const status = document.querySelector("[data-chat-status]");
  let chatId = null;

  const appendBubble = (role, content, meta) => {
    const bubble = document.createElement("div");
    bubble.className = "bubble " + (role === "ASSISTANT" ? "assistant" : "user");
    bubble.innerHTML = "<strong>" + role + "</strong><div>" + content + "</div>" + (meta ? "<small>" + meta + "</small>" : "");
    log.appendChild(bubble);
  };

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = form.querySelector("textarea");
    const content = input.value.trim();
    if (!content) return;
    status.textContent = "发送中...";
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
      appendBubble(
        "ASSISTANT",
        reply.content,
        "推断级别：" + reply.inferenceLevel + " / 依据：" + (reply.basisSummary?.summary || "无")
      );
      input.value = "";
      status.textContent = "已完成";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    }
  });
`;

const renderPersonaPage = async (personaId: string) => {
  const detail = await fetchJson<{
    persona: { displayName: string; currentPublishedVersionId: string; originType: string };
    version: { previewIntro: string | null; recommendedQuestions: string[]; sampleAnswers: string[] };
  }>(`/v1/personae/${personaId}`);

  if (!detail) {
    return renderShell({
      title: "对象不存在",
      subtitle: "没有找到对应对象。",
      body: '<div class="card">请返回首页重新选择对象。</div>',
    });
  }

  return renderShell({
    title: detail.persona.displayName,
    subtitle: detail.version.previewIntro ?? "暂无导语",
    body: `
      <div class="grid two">
        <section class="card stack">
          <div class="badge">${detail.persona.originType}</div>
          <h2>推荐问题</h2>
          <ul class="list">${detail.version.recommendedQuestions.map((item) => `<li>${item}</li>`).join("")}</ul>
          <h2>示例回答</h2>
          <ul class="list">${detail.version.sampleAnswers.map((item) => `<li>${item}</li>`).join("")}</ul>
        </section>
        <section class="card stack">
          <h2>单轮对话</h2>
          <form data-chat-form class="stack">
            <textarea placeholder="输入一个问题，比如：面对冲突时会先考虑什么？"></textarea>
            <div class="actions">
              <button type="submit">发送</button>
            </div>
          </form>
          <div class="status-line" data-chat-status></div>
          <div class="chat-log" data-chat-log></div>
        </section>
      </div>
    `,
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
      body: '<div class="card">请确认 share slug 是否正确。</div>',
    });
  }

  return renderShell({
    title: `${landing.persona.displayName} 分享页`,
    subtitle: landing.version.previewIntro ?? "基于已发布版本的分享入口。",
    body: `
      <div class="grid two">
        <section class="card stack">
          <div class="badge">share ${landing.share.shareSlug}</div>
          <p class="meta">canonical: <code class="inline">${landing.share.canonicalUrl}</code></p>
          <ul class="list">${landing.version.recommendedQuestions.map((item) => `<li>${item}</li>`).join("")}</ul>
        </section>
        <section class="card stack">
          <h2>分享对话</h2>
          <form data-chat-form class="stack">
            <textarea placeholder="从分享页直接开聊"></textarea>
            <div class="actions">
              <button type="submit">发送</button>
            </div>
          </form>
          <div class="status-line" data-chat-status></div>
          <div class="chat-log" data-chat-log></div>
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
    title: "创建对象",
    subtitle: "先创建 persona，再录入资料、发起蒸馏，并跳转到预览版本页提交发布审核。",
    body: `
      <div class="grid two">
        <section class="card stack">
          <h2>Step 1. 创建 persona</h2>
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
        <section class="card stack">
          <h2>Step 2. 导入资料</h2>
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
      </div>
      <section class="card stack">
        <h2>当前资料</h2>
        <ul class="list" data-source-list><li>暂无资料</li></ul>
      </section>
    `,
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
          sourceList.innerHTML = "<li>暂无资料</li>";
          return;
        }

        try {
          const result = await HallOfFameClient.requestJson("/v1/personae/" + personaId + "/sources");
          const items = result.items || [];
          sourceList.innerHTML = items.length
            ? items.map((item) => "<li><strong>" + (item.sourceTitle || item.id) + "</strong><div class='meta'>" + item.inputType + " / " + item.sourceKind + " / " + item.reviewStatus + "</div><p>" + (item.sourceSummary || "") + "</p></li>").join("")
            : "<li>暂无资料</li>";
        } catch (error) {
          sourceList.innerHTML = "<li>" + (error instanceof Error ? error.message : String(error)) + "</li>";
        }
      };

      const ensureSessionAndLoad = async () => {
        await HallOfFameClient.ensureAnonymousSession();
        await refreshSources();
      };

      document.querySelector("[data-create-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        createStatus.textContent = "创建中...";
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
          createStatus.textContent = "已创建 persona " + personaId;
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
        sourceStatus.textContent = "提交文本资料...";
        try {
          await HallOfFameClient.requestJson("/v1/personae/" + personaId + "/sources/text", {
            method: "POST",
            body: JSON.stringify({
              title: String(form.get("title") || ""),
              sourceKind: String(form.get("sourceKind") || "PRIMARY"),
              content: String(form.get("content") || ""),
            }),
          });
          sourceStatus.textContent = "文本资料已提交";
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
        sourceStatus.textContent = "提交 URL 资料...";
        try {
          await HallOfFameClient.requestJson("/v1/personae/" + personaId + "/sources/url", {
            method: "POST",
            body: JSON.stringify({
              url: String(form.get("url") || ""),
              title: String(form.get("title") || ""),
              sourceKind: String(form.get("sourceKind") || "PRIMARY"),
            }),
          });
          sourceStatus.textContent = "URL 资料已提交到 worker";
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
        sourceStatus.textContent = "蒸馏中...";
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
        createStatus.textContent = "升级中...";
        try {
          const session = await HallOfFameClient.requestJson("/v1/auth/web/sms/verify", {
            method: "POST",
            body: JSON.stringify({
              phoneNumber: "13800000000",
              code: "123456",
            }),
          });
          HallOfFameClient.writeSession(session);
          createStatus.textContent = "已升级为手机号用户";
        } catch (error) {
          createStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      void ensureSessionAndLoad();
    `,
  });

const renderPreviewPage = async (personaVersionId: string) =>
  renderShell({
    title: "预览版本",
    subtitle: "在这里检查蒸馏结果、发起预览对话，并提交发布审核。",
    body: `
      <div class="grid two">
        <section class="card stack">
          <h2>版本信息</h2>
          <div data-version-summary class="meta">加载中...</div>
          <div class="actions">
            <button type="button" data-submit-publish>提交发布审核</button>
            <a href="/create">返回创建页</a>
          </div>
          <div class="status-line" data-preview-status></div>
        </section>
        <section class="card stack">
          <h2>预览对话</h2>
          <form data-chat-form class="stack">
            <textarea placeholder="这里走 draft preview chat"></textarea>
            <button type="submit">发送</button>
          </form>
          <div class="status-line" data-chat-status></div>
          <div class="chat-log" data-chat-log></div>
        </section>
      </div>
      <section class="card stack">
        <h2>推荐问题</h2>
        <ul class="list" data-preview-questions><li>加载中...</li></ul>
      </section>
      <section class="card stack">
        <h2>示例回答</h2>
        <ul class="list" data-preview-answers><li>加载中...</li></ul>
      </section>
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
          questionsSlot.innerHTML = version.recommendedQuestions.map((item) => "<li>" + item + "</li>").join("");
          answersSlot.innerHTML = version.sampleAnswers.map((item) => "<li>" + item + "</li>").join("");
        } catch (error) {
          summarySlot.textContent = error instanceof Error ? error.message : String(error);
        }
      };

      document.querySelector("[data-submit-publish]")?.addEventListener("click", async () => {
        previewStatus.textContent = "提交中...";
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
    subtitle: "本地 reviewer 会话用于审批资料和发布请求。这里不走 agent，只保留明确的人工审核操作面。",
    body: `
      <div class="grid two">
        <section class="card stack">
          <h2>Reviewer 会话</h2>
          <div class="actions">
            <button type="button" data-reviewer-login>进入 reviewer 身份</button>
            <button type="button" class="secondary" data-clear-session>清除当前身份</button>
          </div>
          <div class="status-line" data-reviewer-status></div>
        </section>
        <section class="card stack">
          <h2>资料审核</h2>
          <ul class="list" data-source-review-list><li>请先登录 reviewer</li></ul>
        </section>
      </div>
      <section class="card stack">
        <h2>发布审核</h2>
        <ul class="list" data-version-review-list><li>请先登录 reviewer</li></ul>
      </section>
    `,
    script: `
      const reviewerStatus = document.querySelector("[data-reviewer-status]");
      const sourceList = document.querySelector("[data-source-review-list]");
      const versionList = document.querySelector("[data-version-review-list]");

      const loadQueues = async () => {
        const session = HallOfFameClient.readSession();
        if (!session || session.role !== "REVIEWER") {
          reviewerStatus.textContent = "当前不是 reviewer。";
          sourceList.innerHTML = "<li>请先登录 reviewer</li>";
          versionList.innerHTML = "<li>请先登录 reviewer</li>";
          return;
        }

        reviewerStatus.textContent = "已进入 reviewer 身份。";
        const [sourceQueue, versionQueue] = await Promise.all([
          HallOfFameClient.requestJson("/v1/reviews/sources"),
          HallOfFameClient.requestJson("/v1/reviews/persona-versions"),
        ]);

        sourceList.innerHTML = (sourceQueue.items || []).length
          ? sourceQueue.items.map((item) => "<li><strong>" + (item.sourceTitle || item.sourceId) + "</strong><div class='meta'>" + item.displayName + " / " + item.sourceKind + "</div><p>" + (item.sourceSummary || "") + "</p><div class='actions'><button class='ok' data-source-approve='" + item.sourceId + "'>通过</button><button class='danger' data-source-reject='" + item.sourceId + "'>拒绝</button></div></li>").join("")
          : "<li>当前没有待审资料</li>";

        versionList.innerHTML = (versionQueue.items || []).length
          ? versionQueue.items.map((item) => "<li><strong>" + item.displayName + " v" + item.versionNumber + "</strong><div class='meta'>" + (item.previewIntro || "") + "</div><div class='meta'>coverage " + item.coverageScore + " / grounding " + item.groundingScore + " / risk " + item.riskScore + "</div><div class='actions'><button class='ok' data-version-approve='" + item.personaVersionId + "'>发布</button><button class='danger' data-version-reject='" + item.personaVersionId + "'>驳回</button></div></li>").join("")
          : "<li>当前没有待审发布请求</li>";
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

export const buildH5Server = () => {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    ok: true,
    service: "hall-of-fame-h5",
  }));

  app.get("/", async () => renderFeaturedList());
  app.get<{ Params: { personaId: string } }>("/persona/:personaId", async (request) => renderPersonaPage(request.params.personaId));
  app.get<{ Params: { shareSlug: string } }>("/share/:shareSlug", async (request) => renderSharePage(request.params.shareSlug));
  app.get("/create", async () => renderCreatePage());
  app.get<{ Params: { personaVersionId: string } }>("/preview/:personaVersionId", async (request) =>
    renderPreviewPage(request.params.personaVersionId),
  );
  app.get("/review", async () => renderReviewPage());

  return app;
};
