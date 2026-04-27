import {
  listPersonaVersionSourceDocumentsForEmbedding,
  type PersonaVersionSourceDocumentForEmbeddingRecord,
} from "../../db/repositories/chat-retrieval-repository.js";
import {
  runPersonaProfileEmbeddingJob,
  runPersonaSourceEmbeddingJob,
} from "./persona-embedding-job.js";

type PersonaVersionEmbeddingInput = {
  version: {
    id: string;
    personaId: string;
    profileJson: Record<string, unknown>;
    previewIntro: string | null;
    sampleAnswers: string[];
    recommendedQuestions: string[];
  };
};

const readQwenApiKey = () => process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "";

export const isPersonaEmbeddingEnabled = () =>
  process.env.PERSONA_EMBEDDING_ENABLED !== "false" && Boolean(readQwenApiKey());

export const enqueuePersonaVersionEmbeddings = (
  input: PersonaVersionEmbeddingInput,
  deps: {
    isEnabled?: () => boolean;
    runInBackground?: (task: () => Promise<void>) => void;
    listSourceDocuments?: (input: { personaVersionId: string }) => Promise<PersonaVersionSourceDocumentForEmbeddingRecord[]>;
    runProfileJob?: typeof runPersonaProfileEmbeddingJob;
    runSourceJob?: typeof runPersonaSourceEmbeddingJob;
    logger?: {
      warn: (payload: unknown, message?: string) => void;
    };
  } = {},
) => {
  if (!(deps.isEnabled?.() ?? isPersonaEmbeddingEnabled())) {
    return {
      scheduled: false,
      reason: "disabled" as const,
    };
  }

  const listSourceDocuments = deps.listSourceDocuments ?? listPersonaVersionSourceDocumentsForEmbedding;
  const runProfileJob = deps.runProfileJob ?? runPersonaProfileEmbeddingJob;
  const runSourceJob = deps.runSourceJob ?? runPersonaSourceEmbeddingJob;

  const task = async () => {
    try {
      await runProfileJob({
        personaVersionId: input.version.id,
        profileJson: input.version.profileJson,
        previewIntro: input.version.previewIntro,
        sampleAnswers: input.version.sampleAnswers,
        recommendedQuestions: input.version.recommendedQuestions,
      });

      const sourceDocuments = await listSourceDocuments({
        personaVersionId: input.version.id,
      });
      for (const document of sourceDocuments) {
        await runSourceJob({
          personaId: document.personaId,
          personaVersionId: document.personaVersionId,
          sourceId: document.sourceId,
          normalizedText: document.normalizedText,
        });
      }
    } catch (error) {
      deps.logger?.warn(
        {
          kind: "persona_version_embedding_failed",
          personaVersionId: input.version.id,
          errorMessage: error instanceof Error ? error.message : "unknown error",
        },
        "[embeddings] persona version embedding failed",
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
