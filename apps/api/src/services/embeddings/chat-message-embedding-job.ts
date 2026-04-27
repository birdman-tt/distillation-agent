import { upsertChatMessageEmbedding } from "../../db/repositories/chat-retrieval-repository.js";
import { readEmbeddingConfig, type EmbeddingConfig } from "./embedding-config.js";
import { requestQwenEmbeddings } from "./qwen-embedding-client.js";

const readQwenBaseUrl = () => process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
const readQwenApiKey = () => process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "";

export const runChatMessageEmbeddingJob = async (
  input: {
    chatId: string;
    messageId: string;
    role: "SYSTEM" | "USER" | "ASSISTANT";
    content: string;
    turnIndex: number | null;
  },
  deps: {
    readConfig?: () => EmbeddingConfig;
    requestEmbeddings?: (input: {
      model: string;
      dimensions: number;
      inputs: string[];
    }) => Promise<number[][]>;
    upsertEmbedding?: typeof upsertChatMessageEmbedding;
  } = {},
) => {
  const config = deps.readConfig?.() ?? readEmbeddingConfig();
  const requestEmbeddings =
    deps.requestEmbeddings ??
    ((request) =>
      requestQwenEmbeddings({
        apiKey: readQwenApiKey(),
        baseUrl: readQwenBaseUrl(),
        model: request.model,
        dimensions: request.dimensions,
        inputs: request.inputs,
      }));
  const upsertEmbedding = deps.upsertEmbedding ?? upsertChatMessageEmbedding;

  const [embedding] = await requestEmbeddings({
    model: config.model,
    dimensions: config.dimensions,
    inputs: [input.content],
  });

  if (!embedding) {
    throw new Error("Embedding provider returned no embedding");
  }

  return await upsertEmbedding({
    chatId: input.chatId,
    messageId: input.messageId,
    role: input.role,
    content: input.content,
    embedding,
    embeddingModel: config.model,
    embeddingDimensions: config.dimensions,
    turnIndex: input.turnIndex,
  });
};
