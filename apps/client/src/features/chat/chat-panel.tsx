import { createChatSession, sendChatMessage } from "@hall-of-fame/api-client";
import { useRef, useState } from "react";

import { getApiBaseUrl } from "../../lib/api.js";

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

    const pending = createChatSession(
      getApiBaseUrl(),
      props.targetType === "published_persona"
        ? { targetType: props.targetType, personaId: props.personaId }
        : props.targetType === "draft_version_preview"
          ? { targetType: props.targetType, personaVersionId: props.personaVersionId }
          : { targetType: props.targetType, shareSlug: props.shareSlug },
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
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? updater(message) : message)),
    );
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
      const reply = await sendChatMessage(getApiBaseUrl(), session, content);

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
    <section>
      <h3>对话</h3>
      <textarea value={input} onChange={(event) => setInput(event.target.value)} />
      <button type="button" onClick={() => void handleSend()} disabled={!input.trim()}>
        发送
      </button>
      <ul>
        {messages.map((message) => (
          <li key={message.id}>
            <span>{message.role === "ASSISTANT" ? "A" : "Q"}: </span>
            <span>{message.content}</span>
            {message.role === "USER" && message.status === "failed" ? (
              <>
                <span> {message.errorLabel}</span>
                <button type="button" aria-label="重试这句话" onClick={() => void handleRetry(message.id, message.content)}>
                  ↻
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
};
