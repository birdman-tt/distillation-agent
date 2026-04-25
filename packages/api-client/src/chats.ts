type ChatSession = {
  id: string;
};

type ChatMessage = {
  id: string;
  role: "SYSTEM" | "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
};

type ChatMessageAccepted = {
  status: "accepted";
  turnTraceId: string;
  message: ChatMessage;
};

type ChatSessionSummary = {
  id: string;
  targetType: "published_persona" | "draft_version_preview" | "share_link";
  resumePersonaId: string | null;
  targetPersonaVersionId: string;
  shareSlug: string | null;
  displayName: string;
  latestMessage: string;
  updatedAt: string;
};

type ChatSessionSummaryList = {
  items: ChatSessionSummary[];
};

const withAuthHeaders = (accessToken?: string, contentType?: string) => ({
  ...(contentType ? { "content-type": contentType } : {}),
  ...(accessToken
    ? {
        authorization: `Bearer ${accessToken}`,
      }
    : {}),
});

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
  accessToken?: string,
): Promise<ChatSession> => {
  const response = await fetch(`${baseUrl}/v1/chats`, {
    method: "POST",
    headers: withAuthHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });

  return await readJsonOrThrow(response);
};

export const listChatSessions = async (baseUrl: string, accessToken: string): Promise<ChatSessionSummaryList> => {
  const response = await fetch(`${baseUrl}/v1/chats`, {
    headers: withAuthHeaders(accessToken),
  });

  return await readJsonOrThrow(response);
};

export const sendChatMessage = async (
  baseUrl: string,
  chatId: string,
  content: string,
  accessToken?: string,
): Promise<ChatMessage | ChatMessageAccepted> => {
  const response = await fetch(`${baseUrl}/v1/chats/${chatId}/messages`, {
    method: "POST",
    headers: withAuthHeaders(accessToken, "application/json"),
    body: JSON.stringify({ content }),
  });

  return await readJsonOrThrow(response);
};
