export const createTextSource = async (
  baseUrl: string,
  personaId: string,
  payload: {
    content: string;
    title?: string;
    author?: string;
    sourceKind: "PRIMARY" | "SECONDARY" | "SUMMARY";
  },
) => {
  const response = await fetch(`${baseUrl}/v1/personae/${personaId}/sources/text`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return response.json();
};

/** @deprecated Legacy synchronous URL ingest endpoint. New create flows must use discovery/extra-source jobs. */
export const createUrlSource = async (
  baseUrl: string,
  personaId: string,
  payload: {
    url: string;
    title?: string;
    author?: string;
    sourceKind: "PRIMARY" | "SECONDARY" | "SUMMARY";
  },
) => {
  const response = await fetch(`${baseUrl}/v1/personae/${personaId}/sources/url`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return response.json();
};

export const listPersonaSources = async (baseUrl: string, personaId: string) => {
  const response = await fetch(`${baseUrl}/v1/personae/${personaId}/sources`);
  return response.json();
};
