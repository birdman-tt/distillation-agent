type ChatSession = {
  id: string;
};

type ChatMessage = {
  id: string;
  content: string;
};

const readJsonOrThrow = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get("content-type") ?? "";
  const body: unknown = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const errorBody = body && typeof body === "object" ? (body as { message?: unknown }) : null;
    const message =
      typeof body === "string"
        ? body
        : typeof errorBody?.message === "string"
          ? errorBody.message
          : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return body as T;
};

export const createChatSession = async (
  baseUrl: string,
  payload:
    | { targetType: "published_persona"; personaId: string }
    | { targetType: "draft_version_preview"; personaVersionId: string }
    | { targetType: "share_link"; shareSlug: string },
): Promise<ChatSession> => {
  const response = await fetch(`${baseUrl}/v1/chats`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return await readJsonOrThrow(response);
};

export const sendChatMessage = async (baseUrl: string, chatId: string, content: string): Promise<ChatMessage> => {
  const response = await fetch(`${baseUrl}/v1/chats/${chatId}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  return await readJsonOrThrow(response);
};
