export const getFeaturedPersonae = async (baseUrl: string) => {
  const response = await fetch(`${baseUrl}/v1/personae/featured`);
  return response.json();
};

const withOptionalAuthHeaders = (accessToken?: string, contentType?: string) => ({
  ...(contentType ? { "content-type": contentType } : {}),
  ...(accessToken
    ? {
        authorization: `Bearer ${accessToken}`,
      }
    : {}),
});

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

export const getPersonaInventory = async (baseUrl: string, accessToken?: string) => {
  const response = await fetch(`${baseUrl}/v1/me/persona-inventory`, {
    headers: withOptionalAuthHeaders(accessToken),
  });
  return response.json();
};

export const getMyObject = async (baseUrl: string, objectId: string, accessToken?: string) => {
  const response = await fetch(`${baseUrl}/v1/me/objects/${objectId}`, {
    headers: withOptionalAuthHeaders(accessToken),
  });
  return response.json();
};

export const updateMyObject = async (
  baseUrl: string,
  objectId: string,
  payload: {
    displayName?: string;
    intro?: string | null;
  },
  accessToken?: string,
) => {
  const response = await fetch(`${baseUrl}/v1/me/objects/${objectId}`, {
    method: "PATCH",
    headers: withOptionalAuthHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  return response.json();
};

export const confirmMyObject = async (baseUrl: string, objectId: string, accessToken?: string) => {
  const response = await fetch(`${baseUrl}/v1/me/objects/${objectId}/confirm`, {
    method: "POST",
    headers: withOptionalAuthHeaders(accessToken),
  });
  return response.json();
};

export const publishMyObject = async (baseUrl: string, objectId: string, accessToken?: string) => {
  const response = await fetch(`${baseUrl}/v1/me/objects/${objectId}/publish`, {
    method: "POST",
    headers: withOptionalAuthHeaders(accessToken),
  });
  return response.json();
};

export const deleteMyObject = async (baseUrl: string, objectId: string, accessToken?: string) => {
  const response = await fetch(`${baseUrl}/v1/me/objects/${objectId}`, {
    method: "DELETE",
    headers: withOptionalAuthHeaders(accessToken),
  });
  return response.json();
};

export const createDistillIntent = async (
  baseUrl: string,
  payload: {
    query: string;
    usageIntent?: "chat_companion" | "decision_lens" | "learning" | "roleplay";
    focus?: string[];
  },
  accessToken?: string,
) => {
  const response = await fetch(`${baseUrl}/v1/persona-distill-intents`, {
    method: "POST",
    headers: withOptionalAuthHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });

  return response.json();
};

export const discoverDistillSources = async (
  baseUrl: string,
  payload: {
    intentId: string;
    preferredLanguage?: string;
    maxSourcesPerBucket?: number;
  },
  accessToken?: string,
) => {
  const response = await fetch(`${baseUrl}/v1/persona-distill-source-discovery`, {
    method: "POST",
    headers: withOptionalAuthHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });

  return response.json();
};

export const getDistillSourceDiscoveryJob = async (
  baseUrl: string,
  sourceDiscoveryJobId: string,
  accessToken?: string,
) => {
  const response = await fetch(
    `${baseUrl}/v1/persona-distill-source-discovery-jobs/${encodeURIComponent(sourceDiscoveryJobId)}`,
    {
      headers: withOptionalAuthHeaders(accessToken),
    },
  );
  return response.json();
};

export const retryDistillSourceDiscoveryJob = async (
  baseUrl: string,
  sourceDiscoveryJobId: string,
  accessToken?: string,
) => {
  const response = await fetch(
    `${baseUrl}/v1/persona-distill-source-discovery-jobs/${encodeURIComponent(sourceDiscoveryJobId)}/retry`,
    {
      method: "POST",
      headers: withOptionalAuthHeaders(accessToken),
    },
  );
  return response.json();
};

export const addDistillExtraSources = async (
  baseUrl: string,
  discoveryId: string,
  payload: {
    extraTextSources?: Array<{
      title: string;
      content: string;
      sourceKind?: "PRIMARY" | "SECONDARY" | "SUMMARY";
    }>;
    extraUrlSources?: Array<{
      url: string;
      title?: string;
      sourceKind?: "PRIMARY" | "SECONDARY" | "SUMMARY";
    }>;
  },
  accessToken?: string,
) => {
  const response = await fetch(`${baseUrl}/v1/persona-distill-discoveries/${discoveryId}/extra-sources`, {
    method: "POST",
    headers: withOptionalAuthHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });

  return response.json();
};

export const createDistillJob = async (
  baseUrl: string,
  payload: {
    intentId: string;
    discoveryId: string;
    selectedSourceCandidateIds?: string[];
    selectedExtraSourceIds?: string[];
  },
  accessToken?: string,
) => {
  const response = await fetch(`${baseUrl}/v1/persona-distill-jobs`, {
    method: "POST",
    headers: withOptionalAuthHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });

  return response.json();
};

export const getDistillJob = async (baseUrl: string, jobId: string, accessToken?: string) => {
  const response = await fetch(`${baseUrl}/v1/persona-distill-jobs/${jobId}`, {
    headers: withOptionalAuthHeaders(accessToken),
  });
  return response.json();
};

/** @deprecated Legacy synchronous distill endpoint. New create flows must use persona distill jobs. */
export const distillPersona = async (baseUrl: string, personaId: string) => {
  const response = await fetch(`${baseUrl}/v1/personae/${personaId}/distill`, {
    method: "POST",
  });

  return response.json();
};
