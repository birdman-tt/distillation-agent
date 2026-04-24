export const getPersonaVersion = async (baseUrl: string, personaVersionId: string) => {
  const response = await fetch(`${baseUrl}/v1/persona-versions/${personaVersionId}`);
  return response.json();
};

export const submitPersonaVersionPublishReview = async (baseUrl: string, personaVersionId: string) => {
  const response = await fetch(`${baseUrl}/v1/persona-versions/${personaVersionId}/submit-publish-review`, {
    method: "POST",
  });
  return response.json();
};

export const createPersonaVersionShare = async (baseUrl: string, personaVersionId: string) => {
  const response = await fetch(`${baseUrl}/v1/persona-versions/${personaVersionId}/shares`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  return response.json();
};

export const publishPersonaVersion = async (
  baseUrl: string,
  personaVersionId: string,
  visibility: "PRIVATE" | "PUBLIC",
) => {
  const response = await fetch(`${baseUrl}/v1/persona-versions/${personaVersionId}/publish`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ visibility }),
  });
  return response.json();
};
