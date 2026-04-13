import { createChatSession, sendChatMessage } from "@hall-of-fame/api-client";
import { useState } from "react";

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
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState("");

  const handleSend = async () => {
    let session = chatId;
    if (!session) {
      const created = await createChatSession(
        getApiBaseUrl(),
        props.targetType === "published_persona"
          ? { targetType: props.targetType, personaId: props.personaId }
          : props.targetType === "draft_version_preview"
            ? { targetType: props.targetType, personaVersionId: props.personaVersionId }
            : { targetType: props.targetType, shareSlug: props.shareSlug },
      );
      session = created.id as string;
      setChatId(session);
    }

    const reply = await sendChatMessage(getApiBaseUrl(), session, input);
    setMessages((current) => [...current, `Q: ${input}`, `A: ${reply.content}`]);
    setInput("");
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
          <li key={`${message}-${messages.indexOf(message)}`}>{message}</li>
        ))}
      </ul>
    </section>
  );
};
