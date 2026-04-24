const PRIORITY_ARTIFACT_KEYS = [
  "system_prompt",
  "user_prompt",
  "chat_context",
  "classification_snapshot",
  "raw_model_response",
  "normalized_model_response",
  "final_assistant_message",
];

const state = {
  token: "",
  activeTurnTraceId: "",
  activeChatId: "",
  traces: [],
};

const elements = {
  turnTraceForm: document.querySelector("#turn-trace-form"),
  chatIdForm: document.querySelector("#chat-id-form"),
  turnTraceInput: document.querySelector("#turnTraceId"),
  chatIdInput: document.querySelector("#chatId"),
  statusBanner: document.querySelector("#status-banner"),
  traceList: document.querySelector("#trace-list"),
  traceListMeta: document.querySelector("#trace-list-meta"),
  detailMeta: document.querySelector("#detail-meta"),
  traceSummary: document.querySelector("#trace-summary"),
  traceEvents: document.querySelector("#trace-events"),
  traceArtifacts: document.querySelector("#trace-artifacts"),
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const prettyJson = (value) => JSON.stringify(value, null, 2);

const setStatus = (message, tone = "info") => {
  if (!elements.statusBanner) {
    return;
  }

  if (!message) {
    elements.statusBanner.hidden = true;
    elements.statusBanner.textContent = "";
    elements.statusBanner.className = "status-banner";
    return;
  }

  elements.statusBanner.hidden = false;
  elements.statusBanner.textContent = message;
  elements.statusBanner.className = `status-banner ${tone}`;
};

const buildHeaders = () => {
  if (!state.token) {
    return {};
  }

  return {
    "x-internal-debug-key": state.token,
  };
};

const describeError = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 403) {
    return "没有权限读取 trace JSON。请检查 token 是否通过 ?token=... 传入。";
  }
  if (response.status === 404) {
    return payload?.message ?? "没有找到对应 trace。";
  }
  if (response.status === 400) {
    return payload?.message ?? "请求参数不完整。";
  }

  return payload?.message ?? `请求失败（HTTP ${response.status}）。`;
};

const fetchJson = async (path) => {
  const response = await fetch(path, {
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(await describeError(response));
  }

  return response.json();
};

const formatDateTime = (value) => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

const formatDuration = (value) => {
  if (typeof value !== "number") {
    return "—";
  }

  return `${value} ms`;
};

const renderTraceList = (items) => {
  if (!elements.traceList || !elements.traceListMeta) {
    return;
  }

  state.traces = items;
  elements.traceListMeta.textContent = items.length ? `${items.length} 条` : "0 条";

  if (!items.length) {
    elements.traceList.innerHTML = '<div class="empty-state">这个 chat 暂时没有 trace 结果。</div>';
    return;
  }

  elements.traceList.innerHTML = items
    .map((item) => {
      const isActive = item.turnTraceId === state.activeTurnTraceId;
      return `
        <button class="trace-item${isActive ? " active" : ""}" type="button" data-turn-trace-id="${escapeHtml(item.turnTraceId)}">
          <div class="trace-item-top">
            <span class="trace-id">${escapeHtml(item.turnTraceId)}</span>
            <span class="status-pill ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
          </div>
          <div class="trace-item-bottom">
            <span>${escapeHtml(formatDateTime(item.startedAt))}</span>
            <span>${escapeHtml(formatDuration(item.totalDurationMs))}</span>
          </div>
        </button>
      `;
    })
    .join("");

  elements.traceList.querySelectorAll("[data-turn-trace-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const turnTraceId = button.getAttribute("data-turn-trace-id");
      if (turnTraceId) {
        void loadTraceDetail(turnTraceId, { preserveStatus: true });
      }
    });
  });
};

const renderSummary = (trace) => {
  if (!elements.traceSummary || !elements.detailMeta) {
    return;
  }

  elements.detailMeta.textContent = trace.turnTraceId;
  const items = [
    ["turnTraceId", trace.turnTraceId],
    ["status", trace.status],
    ["chatId", trace.chatId],
    ["personaVersionId", trace.personaVersionId],
    ["fallbackUsed", trace.fallbackUsed ? "true" : "false"],
    ["captureLevel", trace.captureLevel],
    ["startedAt", formatDateTime(trace.startedAt)],
    ["completedAt", formatDateTime(trace.completedAt)],
    ["totalDurationMs", formatDuration(trace.totalDurationMs)],
    ["eventCount", String(trace.eventCount)],
  ];

  elements.traceSummary.innerHTML = items
    .map(
      ([label, value]) => `
        <dl class="summary-card">
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value ?? "—")}</dd>
        </dl>
      `,
    )
    .join("");
};

const renderEvents = (events) => {
  if (!elements.traceEvents) {
    return;
  }

  if (!events.length) {
    elements.traceEvents.innerHTML = '<div class="empty-state">暂无事件。</div>';
    return;
  }

  elements.traceEvents.innerHTML = events
    .map(
      (event) => `
        <article class="event-card">
          <header class="event-head">
            <div>
              <div class="event-name">${escapeHtml(event.eventName)}</div>
              <div class="event-meta">
                <span class="status-pill ${escapeHtml(event.status)}">${escapeHtml(event.status)}</span>
                <span>${escapeHtml(event.stage)}</span>
                <span>${escapeHtml(formatDuration(event.durationMs))}</span>
                <span>${escapeHtml(formatDateTime(event.at))}</span>
              </div>
            </div>
          </header>
          <div class="event-body">
            <pre>${escapeHtml(prettyJson(event.fields ?? {}))}</pre>
          </div>
        </article>
      `,
    )
    .join("");
};

const sortArtifacts = (artifacts) =>
  [...artifacts].sort((left, right) => {
    const leftIndex = PRIORITY_ARTIFACT_KEYS.indexOf(left.artifactKey);
    const rightIndex = PRIORITY_ARTIFACT_KEYS.indexOf(right.artifactKey);
    const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    return normalizedLeft - normalizedRight || left.artifactKey.localeCompare(right.artifactKey);
  });

const renderArtifacts = (artifacts) => {
  if (!elements.traceArtifacts) {
    return;
  }

  if (!artifacts.length) {
    elements.traceArtifacts.innerHTML = '<div class="empty-state">暂无 artifacts。</div>';
    return;
  }

  elements.traceArtifacts.innerHTML = sortArtifacts(artifacts)
    .map((artifact, index) => {
      const body =
        artifact.textValue !== null && artifact.textValue !== undefined
          ? artifact.textValue
          : prettyJson(artifact.jsonValue);

      return `
        <article class="artifact-card">
          <details ${index < 2 ? "open" : ""}>
            <summary class="artifact-head">
              <div>
                <div class="artifact-key">${escapeHtml(artifact.artifactKey)}</div>
                <div class="event-meta">
                  <span>${escapeHtml(artifact.contentType)}</span>
                  <span>${escapeHtml(formatDateTime(artifact.createdAt))}</span>
                </div>
              </div>
            </summary>
            <div class="artifact-body">
              <pre>${escapeHtml(body ?? "")}</pre>
            </div>
          </details>
        </article>
      `;
    })
    .join("");
};

const resetDetail = (message = "先选中一条 trace") => {
  if (elements.traceSummary) {
    elements.traceSummary.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }
  if (elements.traceEvents) {
    elements.traceEvents.innerHTML = '<div class="empty-state">暂无事件</div>';
  }
  if (elements.traceArtifacts) {
    elements.traceArtifacts.innerHTML = '<div class="empty-state">暂无 artifacts</div>';
  }
  if (elements.detailMeta) {
    elements.detailMeta.textContent = "未选中";
  }
};

const syncUrl = () => {
  const params = new URLSearchParams(window.location.search);
  if (state.token) {
    params.set("token", state.token);
  } else {
    params.delete("token");
  }

  if (state.activeTurnTraceId) {
    params.set("turnTraceId", state.activeTurnTraceId);
  } else {
    params.delete("turnTraceId");
  }

  if (state.activeChatId) {
    params.set("chatId", state.activeChatId);
  } else {
    params.delete("chatId");
  }

  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  window.history.replaceState(null, "", nextUrl);
};

const loadTraceDetail = async (turnTraceId, options = {}) => {
  const normalized = turnTraceId.trim();
  if (!normalized) {
    setStatus("turnTraceId 不能为空。", "warning");
    return;
  }

  state.activeTurnTraceId = normalized;
  if (elements.turnTraceInput) {
    elements.turnTraceInput.value = normalized;
  }
  syncUrl();

  try {
    if (!options.preserveStatus) {
      setStatus(`正在加载 ${normalized} ...`, "info");
    }
    const detail = await fetchJson(`/internal/debug/chat-traces/${encodeURIComponent(normalized)}`);
    renderSummary(detail.trace);
    renderEvents(detail.events);
    renderArtifacts(detail.artifacts);
    renderTraceList(state.traces);
    setStatus(`已加载 ${normalized}`, "success");
  } catch (error) {
    resetDetail(error instanceof Error ? error.message : "加载 trace 失败。");
    renderTraceList(state.traces);
    setStatus(error instanceof Error ? error.message : "加载 trace 失败。", "error");
  }
};

const loadTraceList = async (chatId) => {
  const normalized = chatId.trim();
  if (!normalized) {
    setStatus("chatId 不能为空。", "warning");
    return;
  }

  state.activeChatId = normalized;
  if (elements.chatIdInput) {
    elements.chatIdInput.value = normalized;
  }
  syncUrl();

  try {
    setStatus(`正在查询 chat ${normalized} ...`, "info");
    const result = await fetchJson(`/internal/debug/chat-traces?chatId=${encodeURIComponent(normalized)}`);
    renderTraceList(result.items ?? []);

    if (!result.items?.length) {
      state.activeTurnTraceId = "";
      syncUrl();
      resetDetail("这个 chat 暂时没有 trace。");
      setStatus(`chat ${normalized} 没有 trace。`, "warning");
      return;
    }

    await loadTraceDetail(result.items[0].turnTraceId, { preserveStatus: true });
    setStatus(`已加载 chat ${normalized} 的最新 trace`, "success");
  } catch (error) {
    state.traces = [];
    renderTraceList([]);
    resetDetail(error instanceof Error ? error.message : "查询 trace 列表失败。");
    setStatus(error instanceof Error ? error.message : "查询 trace 列表失败。", "error");
  }
};

elements.turnTraceForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  state.activeChatId = "";
  if (elements.chatIdInput) {
    elements.chatIdInput.value = "";
  }
  renderTraceList([]);
  void loadTraceDetail(elements.turnTraceInput?.value ?? "");
});

elements.chatIdForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  void loadTraceList(elements.chatIdInput?.value ?? "");
});

const bootstrap = async () => {
  const params = new URLSearchParams(window.location.search);
  state.token = params.get("token") ?? "";
  const turnTraceId = params.get("turnTraceId") ?? "";
  const chatId = params.get("chatId") ?? "";

  if (elements.turnTraceInput) {
    elements.turnTraceInput.value = turnTraceId;
  }
  if (elements.chatIdInput) {
    elements.chatIdInput.value = chatId;
  }

  if (turnTraceId) {
    await loadTraceDetail(turnTraceId);
    return;
  }

  if (chatId) {
    await loadTraceList(chatId);
    return;
  }

  setStatus("等待输入 turnTraceId 或 chatId。", "info");
};

void bootstrap();
