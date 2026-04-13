export const createChatSession = async (
  baseUrl: string,
  payload:
    | { targetType: "published_persona"; personaId: string }
    | { targetType: "draft_version_preview"; personaVersionId: string }
    | { targetType: "share_link"; shareSlug: string },
) => {
  const response = await fetch(`${baseUrl}/v1/chats`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return response.json();
};

export const sendChatMessage = async (baseUrl: string, chatId: string, content: string) => {
  const response = await fetch(`${baseUrl}/v1/chats/${chatId}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  return response.json();
};
