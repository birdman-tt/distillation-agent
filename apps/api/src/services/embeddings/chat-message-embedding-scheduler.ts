import { runChatMessageEmbeddingJob } from "./chat-message-embedding-job.js";

type ChatMessageEmbeddingInput = {
  chatId: string;
  messageId: string;
  role: "SYSTEM" | "USER" | "ASSISTANT";
  content: string;
  turnIndex: number | null;
};

const readQwenApiKey = () => process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "";

export const isChatMessageEmbeddingEnabled = () =>
  process.env.CHAT_MESSAGE_EMBEDDING_ENABLED !== "false" && Boolean(readQwenApiKey());

export const enqueueChatMessageEmbedding = (
  input: ChatMessageEmbeddingInput,
  deps: {
    isEnabled?: () => boolean;
    runJob?: typeof runChatMessageEmbeddingJob;
    runInBackground?: (task: () => Promise<void>) => void;
    logger?: {
      warn: (payload: unknown, message?: string) => void;
    };
  } = {},
) => {
  if (!(deps.isEnabled?.() ?? isChatMessageEmbeddingEnabled())) {
    return {
      scheduled: false,
      reason: "disabled" as const,
    };
  }

  const runJob = deps.runJob ?? runChatMessageEmbeddingJob;
  const task = async () => {
    try {
      await runJob(input);
    } catch (error) {
      deps.logger?.warn(
        {
          kind: "chat_message_embedding_failed",
          chatId: input.chatId,
          messageId: input.messageId,
          errorMessage: error instanceof Error ? error.message : "unknown error",
        },
        "[embeddings] chat message embedding failed",
      );
    }
  };

  const runInBackground = deps.runInBackground ?? ((backgroundTask: () => Promise<void>) => void backgroundTask());
  runInBackground(task);

  return {
    scheduled: true,
    reason: null,
  };
};
