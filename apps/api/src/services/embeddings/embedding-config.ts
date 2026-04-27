export type EmbeddingConfig = {
  provider: string;
  model: string;
  dimensions: number;
};

const readPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const readEmbeddingConfig = (): EmbeddingConfig => ({
  provider: process.env.EMBEDDING_PROVIDER ?? "qwen",
  model: process.env.EMBEDDING_MODEL ?? "text-embedding-v4",
  dimensions: readPositiveInteger(process.env.EMBEDDING_DIMENSIONS, 1024),
});
