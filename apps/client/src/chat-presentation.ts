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
    parts.push("当前答案主动避开了彼此冲突的材料。");
  }

  const explanation = parts.filter(Boolean).join(" ");
  if (!explanation) {
    return "";
  }

  return `<details class="reply-inspector"><summary>这句话怎么来的</summary><div class="meta">${escapeHtml(explanation)}</div></details>`;
};
