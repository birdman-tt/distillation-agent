import { createChatSession, sendChatMessage } from "@hall-of-fame/api-client";
import { uiTokens } from "@hall-of-fame/ui-tokens";
import { useRef, useState } from "react";

import { getApiBaseUrl } from "../../lib/api.js";

const sessionStorageKey = "hall-of-fame-session";

const readStoredAccessToken = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(sessionStorageKey);
    const session = raw ? (JSON.parse(raw) as { accessToken?: string } | null) : null;
    return typeof session?.accessToken === "string" ? session.accessToken : null;
  } catch {
    return null;
  }
};

const ensureAnonymousAccessToken = async () => {
  const existingToken = readStoredAccessToken();
  if (existingToken) {
    return existingToken;
  }

  const response = await fetch(`${getApiBaseUrl()}/v1/auth/anonymous`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ deviceId: "react-browser" }),
  });

  const payload = (await response.json().catch(() => null)) as { accessToken?: string; message?: string } | null;
  if (!response.ok || typeof payload?.accessToken !== "string") {
    throw new Error(payload?.message ?? "创建匿名会话失败");
  }

  try {
    localStorage.setItem(sessionStorageKey, JSON.stringify(payload));
  } catch {
    // ignore storage write failures
  }

  return payload.accessToken;
};

type ChatPanelProps =
  | {
      targetType: "published_persona";
      personaId: string;
    }
  | {
      targetType: "draft_version_preview";
      personaVersionId: string;
    }
  | {
      targetType: "share_link";
      shareSlug: string;
    };

export const ChatPanel = (props: ChatPanelProps) => {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<
    Array<{
      id: string;
      role: "USER" | "ASSISTANT";
      content: string;
      status: "pending" | "sent" | "failed";
      errorLabel?: string;
    }>
  >([]);
  const [input, setInput] = useState("");
  const sessionPromiseRef = useRef<Promise<string> | null>(null);

  const createLocalMessageId = () =>
    globalThis.crypto?.randomUUID?.() ?? `message-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const ensureChatSession = async () => {
    if (chatId) {
      return chatId;
    }

    if (sessionPromiseRef.current) {
      return await sessionPromiseRef.current;
    }

    const accessToken = await ensureAnonymousAccessToken();
    const pending = createChatSession(
      getApiBaseUrl(),
      props.targetType === "published_persona"
        ? { targetType: props.targetType, personaId: props.personaId }
        : props.targetType === "draft_version_preview"
          ? { targetType: props.targetType, personaVersionId: props.personaVersionId }
          : { targetType: props.targetType, shareSlug: props.shareSlug },
      accessToken,
    )
      .then((created) => {
        const session = created.id as string;
        setChatId(session);
        return session;
      })
      .finally(() => {
        sessionPromiseRef.current = null;
      });

    sessionPromiseRef.current = pending;
    return await pending;
  };

  const updateUserMessage = (
    messageId: string,
    updater: (message: {
      id: string;
      role: "USER" | "ASSISTANT";
      content: string;
      status: "pending" | "sent" | "failed";
      errorLabel?: string;
    }) => {
      id: string;
      role: "USER" | "ASSISTANT";
      content: string;
      status: "pending" | "sent" | "failed";
      errorLabel?: string;
    },
  ) => {
    setMessages((current) => current.map((message) => (message.id === messageId ? updater(message) : message)));
  };

  const deliverUserMessage = async (messageId: string, content: string) => {
    let failureLabel: "发送失败" | "回复失败" = "发送失败";

    updateUserMessage(messageId, (message) => ({
      ...message,
      status: "pending",
      errorLabel: undefined,
    }));

    try {
      const session = await ensureChatSession();
      failureLabel = "回复失败";
      const reply = await sendChatMessage(getApiBaseUrl(), session, content, readStoredAccessToken() ?? undefined);

      setMessages((current) =>
        current.flatMap((message) =>
          message.id === messageId
            ? [
                {
                  ...message,
                  status: "sent",
                  errorLabel: undefined,
                },
                {
                  id: createLocalMessageId(),
                  role: "ASSISTANT",
                  content: reply.content,
                  status: "sent",
                },
              ]
            : [message],
        ),
      );
    } catch {
      updateUserMessage(messageId, (message) => ({
        ...message,
        status: "failed",
        errorLabel: failureLabel,
      }));
    }
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content) {
      return;
    }

    const userMessageId = createLocalMessageId();
    setInput("");
    setMessages((current) => [
      ...current,
      {
        id: userMessageId,
        role: "USER",
        content,
        status: "pending",
      },
    ]);

    await deliverUserMessage(userMessageId, content);
  };

  const handleRetry = async (messageId: string, content: string) => {
    await deliverUserMessage(messageId, content);
  };

  return (
    <section
      style={{
        display: "grid",
        gap: uiTokens.spacing.md,
        padding: uiTokens.spacing.lg,
        borderRadius: 28,
        background: "rgba(255,255,255,0.58)",
        border: `1px solid ${uiTokens.colors.lineLight}`,
      }}
    >
      <header style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.56 }}>Chat</span>
        <h3 style={{ margin: 0, fontFamily: uiTokens.typography.display.family, fontSize: uiTokens.typography.display.sizes.panel }}>对话</h3>
      </header>

      <div style={{ display: "grid", gap: uiTokens.spacing.sm }}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              marginLeft: message.role === "USER" ? "auto" : 0,
              maxWidth: "82%",
              padding: "12px 14px",
              borderRadius: 22,
              background:
                message.role === "USER"
                  ? uiTokens.colors.signalBlue
                  : "rgba(255,255,255,0.48)",
              color: message.role === "USER" ? uiTokens.colors.lightSurface : uiTokens.colors.ink,
              border: `1px solid ${uiTokens.colors.lineLight}`,
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.6 }}>
              {message.role === "ASSISTANT" ? "对象" : "我"}
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.68 }}>{message.content}</div>
            {message.role === "USER" && message.status === "failed" ? (
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: uiTokens.spacing.xs, marginTop: 8 }}>
                <span style={{ fontSize: 12, color: uiTokens.colors.danger }}>{message.errorLabel}</span>
                <button
                  type="button"
                  aria-label="重试"
                  onClick={() => void handleRetry(message.id, message.content)}
                  style={{
                    minHeight: 28,
                    width: 28,
                    padding: 0,
                    borderRadius: 999,
                    border: `1px solid ${uiTokens.colors.lineLight}`,
                    background: uiTokens.colors.lightSoft,
                    color: uiTokens.colors.ink,
                    boxShadow: "none",
                  }}
                >
                  ↻
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gap: uiTokens.spacing.sm,
          padding: uiTokens.spacing.sm,
          borderRadius: 24,
          background: "rgba(255,255,255,0.58)",
          border: `1px solid ${uiTokens.colors.lineLight}`,
        }}
      >
        <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入你想说的话" />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={() => void handleSend()} disabled={!input.trim()}>
            发送
          </button>
        </div>
      </div>
    </section>
  );
};
