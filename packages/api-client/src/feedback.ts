export const submitFeedback = async (
  baseUrl: string,
  payload: {
    personaId: string;
    personaVersionId: string;
    chatMessageId?: string;
    feedbackKind: "LIKENESS" | "GROUNDING";
    feedbackValue: "POSITIVE" | "NEGATIVE";
  },
) => {
  const response = await fetch(`${baseUrl}/v1/feedback`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return response.json();
};
