const withOptionalAuthHeaders = (accessToken?: string, contentType?: string) => ({
  ...(contentType ? { "content-type": contentType } : {}),
  ...(accessToken
    ? {
        authorization: `Bearer ${accessToken}`,
      }
    : {}),
});

export const getPersonaVersion = async (baseUrl: string, personaVersionId: string, accessToken?: string) => {
  const response = await fetch(`${baseUrl}/v1/persona-versions/${personaVersionId}`, {
    headers: withOptionalAuthHeaders(accessToken),
  });
  return response.json();
};

export const submitPersonaVersionPublishReview = async (baseUrl: string, personaVersionId: string, accessToken?: string) => {
  const response = await fetch(`${baseUrl}/v1/persona-versions/${personaVersionId}/submit-publish-review`, {
    method: "POST",
    headers: withOptionalAuthHeaders(accessToken),
  });
  return response.json();
};

export const createPersonaVersionShare = async (baseUrl: string, personaVersionId: string, accessToken?: string) => {
  const response = await fetch(`${baseUrl}/v1/persona-versions/${personaVersionId}/shares`, {
    method: "POST",
    headers: withOptionalAuthHeaders(accessToken, "application/json"),
    body: JSON.stringify({}),
  });
  return response.json();
};

export const publishPersonaVersion = async (
  baseUrl: string,
  personaVersionId: string,
  visibility: "PRIVATE" | "PUBLIC",
  accessToken?: string,
) => {
  const response = await fetch(`${baseUrl}/v1/persona-versions/${personaVersionId}/publish`, {
    method: "POST",
    headers: withOptionalAuthHeaders(accessToken, "application/json"),
    body: JSON.stringify({ visibility }),
  });
  return response.json();
};

export const discardPersonaVersion = async (baseUrl: string, personaVersionId: string, accessToken?: string) => {
  const response = await fetch(`${baseUrl}/v1/persona-versions/${personaVersionId}/discard`, {
    method: "POST",
    headers: withOptionalAuthHeaders(accessToken),
  });
  return response.json();
};
