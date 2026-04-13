export const listPendingSourceReviews = async (baseUrl: string) => {
  const response = await fetch(`${baseUrl}/v1/reviews/sources`);
  return response.json();
};

export const approveSource = async (baseUrl: string, sourceId: string, reason = "Approved by reviewer") => {
  const response = await fetch(`${baseUrl}/v1/reviews/sources/${sourceId}/approve`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });
  return response.json();
};

export const rejectSource = async (baseUrl: string, sourceId: string, reason = "Rejected by reviewer") => {
  const response = await fetch(`${baseUrl}/v1/reviews/sources/${sourceId}/reject`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });
  return response.json();
};

export const listPendingPublishReviews = async (baseUrl: string) => {
  const response = await fetch(`${baseUrl}/v1/reviews/persona-versions`);
  return response.json();
};

export const approvePublishReview = async (baseUrl: string, personaVersionId: string, reason = "Approved for publish") => {
  const response = await fetch(`${baseUrl}/v1/reviews/persona-versions/${personaVersionId}/approve-publish`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });
  return response.json();
};

export const rejectPublishReview = async (baseUrl: string, personaVersionId: string, reason = "Rejected for publish") => {
  const response = await fetch(`${baseUrl}/v1/reviews/persona-versions/${personaVersionId}/reject-publish`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });
  return response.json();
};
