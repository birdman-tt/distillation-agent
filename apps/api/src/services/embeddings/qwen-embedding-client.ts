import { z } from "zod";

const qwenEmbeddingResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number()),
    }),
  ),
});

type FetchLike = typeof fetch;

export const requestQwenEmbeddings = async (
  input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    dimensions: number;
    inputs: string[];
  },
  deps: {
    fetch?: FetchLike;
    signal?: AbortSignal;
  } = {},
) => {
  const fetchImpl = deps.fetch ?? fetch;
  const response = await fetchImpl(`${input.baseUrl.replace(/\/$/u, "")}/embeddings`, {
    method: "POST",
    headers: new Headers({
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    }),
    body: JSON.stringify({
      model: input.model,
      input: input.inputs,
      dimensions: input.dimensions,
    }),
    signal: deps.signal,
  });

  if (!response.ok) {
    throw new Error(`Qwen embedding request failed with status ${response.status}`);
  }

  const parsed = qwenEmbeddingResponseSchema.parse(await response.json());
  return parsed.data.map((item) => item.embedding);
};
