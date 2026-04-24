export const getFeaturedPersonae = async (baseUrl: string) => {
  const response = await fetch(`${baseUrl}/v1/personae/featured`);
  return response.json();
};

export const getPersonaDetail = async (baseUrl: string, personaId: string) => {
  const response = await fetch(`${baseUrl}/v1/personae/${personaId}`);
  return response.json();
};

export const createPersona = async (
  baseUrl: string,
  payload: {
    displayName: string;
    positioning: string;
    personaType: "HISTORICAL_FIGURE" | "AUTHOR_OR_BLOGGER" | "ORIGINAL_PERSONA";
    originType: "OFFICIAL" | "USER";
    distillFocus: string[];
  },
) => {
  const response = await fetch(`${baseUrl}/v1/personae`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return response.json();
};

export const updatePersona = async (
  baseUrl: string,
  personaId: string,
  payload: {
    displayName?: string;
    listingStatus?: "PRIVATE" | "UNLISTED" | "FEATURED" | "REMOVED";
    status?: "DRAFT" | "PROCESSING" | "READY" | "PUBLISHED" | "REJECTED";
  },
) => {
  const response = await fetch(`${baseUrl}/v1/personae/${personaId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return response.json();
};

export const listPersonaVersions = async (baseUrl: string, personaId: string) => {
  const response = await fetch(`${baseUrl}/v1/personae/${personaId}/versions`);
  return response.json();
};

export const getMyPersonae = async (baseUrl: string, accessToken?: string) => {
  const response = await fetch(`${baseUrl}/v1/me/personae`, {
    headers: accessToken
      ? {
          authorization: `Bearer ${accessToken}`,
        }
      : undefined,
  });
  return response.json();
};

export const distillPersona = async (baseUrl: string, personaId: string) => {
  const response = await fetch(`${baseUrl}/v1/personae/${personaId}/distill`, {
    method: "POST",
  });

  return response.json();
};
