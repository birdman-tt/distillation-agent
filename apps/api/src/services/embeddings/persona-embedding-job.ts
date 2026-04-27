import {
  upsertPersonaProfileChunkEmbedding,
  upsertPersonaSourceChunkEmbedding,
} from "../../db/repositories/chat-retrieval-repository.js";
import { readEmbeddingConfig, type EmbeddingConfig } from "./embedding-config.js";
import { requestQwenEmbeddings } from "./qwen-embedding-client.js";

type EmbeddingRequester = (input: {
  model: string;
  dimensions: number;
  inputs: string[];
}) => Promise<number[][]>;

const readQwenBaseUrl = () => process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
const readQwenApiKey = () => process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "";

const normalizeWhitespace = (value: string) => value.replace(/\s+/gu, " ").trim();

export const splitTextForEmbedding = (
  text: string,
  options: {
    maxChars?: number;
  } = {},
) => {
  const maxChars = Math.max(1, options.maxChars ?? 900);
  const normalized = normalizeWhitespace(text);
  const chunks: Array<{ chunkIndex: number; content: string }> = [];

  for (let start = 0; start < normalized.length; start += maxChars) {
    const content = normalized.slice(start, start + maxChars).trim();
    if (content) {
      chunks.push({
        chunkIndex: chunks.length,
        content,
      });
    }
  }

  return chunks;
};

const stringifyProfileValue = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join("\n");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return "";
};

export const buildPersonaProfileEmbeddingChunks = (input: {
  profileJson: Record<string, unknown>;
  previewIntro: string | null;
  sampleAnswers: string[];
  recommendedQuestions: string[];
}) => {
  const candidates = [
    {
      section: "summary",
      content: stringifyProfileValue(input.profileJson.summary) || input.previewIntro || "",
    },
    {
      section: "principles",
      content:
        stringifyProfileValue(input.profileJson.principles) ||
        stringifyProfileValue(input.profileJson.values) ||
        stringifyProfileValue(input.profileJson.judgmentFramework),
    },
    {
      section: "topic_strengths",
      content:
        stringifyProfileValue(input.profileJson.topicStrengths) ||
        stringifyProfileValue(input.profileJson.topics) ||
        stringifyProfileValue(input.profileJson.distillFocus),
    },
    {
      section: "style_examples",
      content: input.sampleAnswers.join("\n"),
    },
    {
      section: "recommended_questions",
      content: input.recommendedQuestions.join("\n"),
    },
  ];

  return candidates
    .map((item) => ({
      section: item.section,
      content: normalizeWhitespace(item.content),
    }))
    .filter((item) => item.content.length > 0);
};

const resolveEmbeddingDeps = (deps: {
  readConfig?: () => EmbeddingConfig;
  requestEmbeddings?: EmbeddingRequester;
}) => {
  const config = deps.readConfig?.() ?? readEmbeddingConfig();
  const requestEmbeddings =
    deps.requestEmbeddings ??
    ((request: { model: string; dimensions: number; inputs: string[] }) =>
      requestQwenEmbeddings({
        apiKey: readQwenApiKey(),
        baseUrl: readQwenBaseUrl(),
        model: request.model,
        dimensions: request.dimensions,
        inputs: request.inputs,
      }));

  return {
    config,
    requestEmbeddings,
  };
};

export const runPersonaProfileEmbeddingJob = async (
  input: {
    personaVersionId: string;
    profileJson: Record<string, unknown>;
    previewIntro: string | null;
    sampleAnswers: string[];
    recommendedQuestions: string[];
  },
  deps: {
    readConfig?: () => EmbeddingConfig;
    requestEmbeddings?: EmbeddingRequester;
    upsertProfileChunk?: typeof upsertPersonaProfileChunkEmbedding;
  } = {},
) => {
  const chunks = buildPersonaProfileEmbeddingChunks(input);
  if (chunks.length === 0) {
    return {
      embeddedCount: 0,
    };
  }

  const { config, requestEmbeddings } = resolveEmbeddingDeps(deps);
  const embeddings = await requestEmbeddings({
    model: config.model,
    dimensions: config.dimensions,
    inputs: chunks.map((chunk) => chunk.content),
  });
  const upsertProfileChunk = deps.upsertProfileChunk ?? upsertPersonaProfileChunkEmbedding;

  for (const [index, chunk] of chunks.entries()) {
    const embedding = embeddings[index];
    if (!embedding) {
      continue;
    }
    await upsertProfileChunk({
      personaVersionId: input.personaVersionId,
      section: chunk.section,
      content: chunk.content,
      embedding,
      embeddingModel: config.model,
      embeddingDimensions: config.dimensions,
    });
  }

  return {
    embeddedCount: embeddings.length,
  };
};

export const runPersonaSourceEmbeddingJob = async (
  input: {
    personaId: string;
    personaVersionId: string;
    sourceId: string;
    normalizedText: string;
  },
  deps: {
    readConfig?: () => EmbeddingConfig;
    requestEmbeddings?: EmbeddingRequester;
    upsertSourceChunk?: typeof upsertPersonaSourceChunkEmbedding;
  } = {},
) => {
  const chunks = splitTextForEmbedding(input.normalizedText);
  if (chunks.length === 0) {
    return {
      embeddedCount: 0,
    };
  }

  const { config, requestEmbeddings } = resolveEmbeddingDeps(deps);
  const embeddings = await requestEmbeddings({
    model: config.model,
    dimensions: config.dimensions,
    inputs: chunks.map((chunk) => chunk.content),
  });
  const upsertSourceChunk = deps.upsertSourceChunk ?? upsertPersonaSourceChunkEmbedding;

  for (const [index, chunk] of chunks.entries()) {
    const embedding = embeddings[index];
    if (!embedding) {
      continue;
    }
    await upsertSourceChunk({
      personaId: input.personaId,
      personaVersionId: input.personaVersionId,
      sourceId: input.sourceId,
      personaChunkId: null,
      chunkIndex: chunk.chunkIndex,
      chunkText: chunk.content,
      embedding,
      embeddingModel: config.model,
      embeddingDimensions: config.dimensions,
    });
  }

  return {
    embeddedCount: embeddings.length,
  };
};
