type ChatReplyLike = {
  basisSummary?: {
    mode?: "SUPPORTED" | "INFERRED" | "UNSUPPORTED";
    summary?: string | null;
  } | null;
  conflictDetected?: boolean | null;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const buildReplyInspectorHtml = (reply: ChatReplyLike) => {
  const summary = reply.basisSummary?.summary?.trim();
  const parts = [summary];

  if (reply.conflictDetected) {
    parts.push("已避开冲突信息。");
  }

  const explanation = parts.filter(Boolean).join(" ");
  if (!explanation) {
    return "";
  }

  return `<details class="reply-inspector"><summary>回答依据</summary><div class="meta">${escapeHtml(explanation)}</div></details>`;
};
