import { getSql } from "../client.js";

const toVectorLiteral = (embedding: number[]) => `[${embedding.map((value) => Number(value).toString()).join(",")}]`;

export type UserMemoryFactRecord = {
  id: string;
  chatId: string;
  factType: string;
  factValue: string;
  sourceMessageId: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessageEmbeddingHitRecord = {
  chatId: string;
  messageId: string;
  role: "SYSTEM" | "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  turnIndex: number;
  score: number;
};

export type PersonaSourceChunkEmbeddingHitRecord = {
  personaId: string;
  personaVersionId: string;
  sourceId: string;
  personaChunkId: string | null;
  title: string | null;
  chunkIndex: number;
  content: string;
  score: number;
};

export type PersonaProfileChunkEmbeddingHitRecord = {
  personaVersionId: string;
  section: string;
  content: string;
  score: number;
};

export type PersonaVersionSourceDocumentForEmbeddingRecord = {
  personaId: string;
  personaVersionId: string;
  sourceId: string;
  documentId: string;
  normalizedText: string;
};

export const upsertChatMessageEmbedding = async (input: {
  chatId: string;
  messageId: string;
  role: "SYSTEM" | "USER" | "ASSISTANT";
  content: string;
  embedding: number[];
  embeddingModel: string;
  embeddingDimensions: number;
  turnIndex: number | null;
}) => {
  const sql = getSql();
  const [row] = await sql<{ id: string }[]>`
    insert into chat_message_embeddings (
      chat_id,
      message_id,
      role,
      content,
      embedding,
      embedding_model,
      embedding_dimensions,
      turn_index,
      embedded_at
    ) values (
      ${input.chatId}::uuid,
      ${input.messageId}::uuid,
      ${input.role},
      ${input.content},
      ${toVectorLiteral(input.embedding)}::vector,
      ${input.embeddingModel},
      ${input.embeddingDimensions},
      ${input.turnIndex},
      now()
    )
    on conflict (message_id, embedding_model) do update
      set content = excluded.content,
          embedding = excluded.embedding,
          embedding_dimensions = excluded.embedding_dimensions,
          turn_index = excluded.turn_index,
          embedded_at = now()
    returning id
  `;

  return row?.id ?? null;
};

export const searchChatMessageEmbeddings = async (input: {
  chatId: string;
  embedding: number[];
  embeddingModel: string;
  limit: number;
  roles?: Array<"SYSTEM" | "USER" | "ASSISTANT">;
  excludeMessageIds?: string[];
  latestTurnIndex?: number | null;
}): Promise<ChatMessageEmbeddingHitRecord[]> => {
  const sql = getSql();
  const vector = toVectorLiteral(input.embedding);
  const rows = await sql<{
    chatId: string;
    messageId: string;
    role: "SYSTEM" | "USER" | "ASSISTANT";
    content: string;
    createdAt: Date;
    turnIndex: number | null;
    score: number;
  }[]>`
    select
      embeddings.chat_id as "chatId",
      embeddings.message_id as "messageId",
      embeddings.role,
      embeddings.content,
      messages.created_at as "createdAt",
      embeddings.turn_index as "turnIndex",
      greatest(0, 1 - (embeddings.embedding <=> ${vector}::vector)) as score
    from chat_message_embeddings embeddings
    join chat_messages messages on messages.id = embeddings.message_id
    where embeddings.chat_id = ${input.chatId}::uuid
      and embeddings.embedding_model = ${input.embeddingModel}
      ${input.roles?.length ? sql`and embeddings.role in ${sql(input.roles)}` : sql``}
      ${input.excludeMessageIds?.length ? sql`and embeddings.message_id not in ${sql(input.excludeMessageIds)}` : sql``}
    order by embeddings.embedding <=> ${vector}::vector asc,
             messages.created_at desc
    limit ${Math.max(1, input.limit)}
  `;

  return rows.map((row) => ({
    chatId: row.chatId,
    messageId: row.messageId,
    role: row.role,
    content: row.content,
    createdAt: new Date(row.createdAt).toISOString(),
    turnIndex: row.turnIndex ?? 0,
    score: Number(row.score),
  }));
};

export const upsertPersonaSourceChunkEmbedding = async (input: {
  personaId: string;
  personaVersionId: string;
  sourceId: string;
  personaChunkId: string | null;
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
  embeddingModel: string;
  embeddingDimensions: number;
}) => {
  const sql = getSql();
  const [row] = await sql<{ id: string }[]>`
    insert into persona_source_chunk_embeddings (
      persona_id,
      persona_version_id,
      persona_chunk_id,
      source_id,
      chunk_index,
      chunk_text,
      embedding,
      embedding_model,
      embedding_dimensions,
      embedded_at
    ) values (
      ${input.personaId}::uuid,
      ${input.personaVersionId}::uuid,
      ${input.personaChunkId ?? null}::uuid,
      ${input.sourceId}::uuid,
      ${input.chunkIndex},
      ${input.chunkText},
      ${toVectorLiteral(input.embedding)}::vector,
      ${input.embeddingModel},
      ${input.embeddingDimensions},
      now()
    )
    on conflict (persona_version_id, source_id, chunk_index, embedding_model) do update
      set persona_chunk_id = excluded.persona_chunk_id,
          chunk_text = excluded.chunk_text,
          embedding = excluded.embedding,
          embedding_dimensions = excluded.embedding_dimensions,
          embedded_at = now()
    returning id
  `;

  return row?.id ?? null;
};

export const searchPersonaSourceChunkEmbeddings = async (input: {
  personaVersionId: string;
  embedding: number[];
  embeddingModel: string;
  limit: number;
}): Promise<PersonaSourceChunkEmbeddingHitRecord[]> => {
  const sql = getSql();
  const vector = toVectorLiteral(input.embedding);
  const rows = await sql<{
    personaId: string;
    personaVersionId: string;
    sourceId: string;
    personaChunkId: string | null;
    title: string | null;
    chunkIndex: number;
    content: string;
    score: number;
  }[]>`
    select
      embeddings.persona_id as "personaId",
      embeddings.persona_version_id as "personaVersionId",
      embeddings.source_id as "sourceId",
      embeddings.persona_chunk_id as "personaChunkId",
      sources.source_title as title,
      embeddings.chunk_index as "chunkIndex",
      embeddings.chunk_text as content,
      greatest(0, 1 - (embeddings.embedding <=> ${vector}::vector)) as score
    from persona_source_chunk_embeddings embeddings
    left join persona_sources sources on sources.id = embeddings.source_id
    where embeddings.persona_version_id = ${input.personaVersionId}::uuid
      and embeddings.embedding_model = ${input.embeddingModel}
    order by embeddings.embedding <=> ${vector}::vector asc,
             embeddings.chunk_index asc
    limit ${Math.max(1, input.limit)}
  `;

  return rows.map((row) => ({
    personaId: row.personaId,
    personaVersionId: row.personaVersionId,
    sourceId: row.sourceId,
    personaChunkId: row.personaChunkId,
    title: row.title,
    chunkIndex: row.chunkIndex,
    content: row.content,
    score: Number(row.score),
  }));
};

export const upsertPersonaProfileChunkEmbedding = async (input: {
  personaVersionId: string;
  section: string;
  content: string;
  embedding: number[];
  embeddingModel: string;
  embeddingDimensions: number;
}) => {
  const sql = getSql();
  const [row] = await sql<{ id: string }[]>`
    insert into persona_profile_chunk_embeddings (
      persona_version_id,
      section,
      content,
      embedding,
      embedding_model,
      embedding_dimensions,
      embedded_at
    ) values (
      ${input.personaVersionId}::uuid,
      ${input.section},
      ${input.content},
      ${toVectorLiteral(input.embedding)}::vector,
      ${input.embeddingModel},
      ${input.embeddingDimensions},
      now()
    )
    on conflict (persona_version_id, section, embedding_model) do update
      set content = excluded.content,
          embedding = excluded.embedding,
          embedding_dimensions = excluded.embedding_dimensions,
          embedded_at = now()
    returning id
  `;

  return row?.id ?? null;
};

export const searchPersonaProfileChunkEmbeddings = async (input: {
  personaVersionId: string;
  embedding: number[];
  embeddingModel: string;
  limit: number;
}): Promise<PersonaProfileChunkEmbeddingHitRecord[]> => {
  const sql = getSql();
  const vector = toVectorLiteral(input.embedding);
  const rows = await sql<{
    personaVersionId: string;
    section: string;
    content: string;
    score: number;
  }[]>`
    select
      persona_version_id as "personaVersionId",
      section,
      content,
      greatest(0, 1 - (embedding <=> ${vector}::vector)) as score
    from persona_profile_chunk_embeddings
    where persona_version_id = ${input.personaVersionId}::uuid
      and embedding_model = ${input.embeddingModel}
    order by embedding <=> ${vector}::vector asc,
             section asc
    limit ${Math.max(1, input.limit)}
  `;

  return rows.map((row) => ({
    personaVersionId: row.personaVersionId,
    section: row.section,
    content: row.content,
    score: Number(row.score),
  }));
};

export const listPersonaVersionSourceDocumentsForEmbedding = async (input: {
  personaVersionId: string;
}): Promise<PersonaVersionSourceDocumentForEmbeddingRecord[]> => {
  const sql = getSql();
  const rows = await sql<{
    personaId: string;
    personaVersionId: string;
    sourceId: string;
    documentId: string;
    normalizedText: string;
  }[]>`
    select
      versions.persona_id as "personaId",
      version_sources.persona_version_id as "personaVersionId",
      version_sources.source_id as "sourceId",
      documents.id as "documentId",
      documents.normalized_text as "normalizedText"
    from persona_version_sources version_sources
    join persona_versions versions on versions.id = version_sources.persona_version_id
    join source_documents documents on documents.id = version_sources.document_id
    where version_sources.persona_version_id = ${input.personaVersionId}::uuid
    order by version_sources.created_at asc, documents.created_at asc
  `;

  return rows.map((row) => ({
    personaId: row.personaId,
    personaVersionId: row.personaVersionId,
    sourceId: row.sourceId,
    documentId: row.documentId,
    normalizedText: row.normalizedText,
  }));
};

export const upsertUserMemoryFact = async (input: {
  chatId: string;
  sourceMessageId: string;
  factType: string;
  factValue: string;
  confidence: number;
}) => {
  const sql = getSql();
  const [row] = await sql<{ id: string }[]>`
    insert into user_memory_facts (
      chat_id,
      fact_type,
      fact_value,
      source_message_id,
      confidence,
      is_active,
      updated_at
    ) values (
      ${input.chatId}::uuid,
      ${input.factType},
      ${input.factValue},
      ${input.sourceMessageId}::uuid,
      ${input.confidence},
      true,
      now()
    )
    on conflict (chat_id, fact_type, fact_value, source_message_id) do update
      set confidence = excluded.confidence,
          is_active = true,
          updated_at = now()
    returning id
  `;

  return row?.id ?? null;
};

export const listActiveUserMemoryFacts = async (input: {
  chatId: string;
  factTypes?: string[];
}): Promise<UserMemoryFactRecord[]> => {
  const sql = getSql();
  const rows = await sql<{
    id: string;
    chatId: string;
    factType: string;
    factValue: string;
    sourceMessageId: string;
    confidence: number;
    createdAt: Date;
    updatedAt: Date;
  }[]>`
    select
      id,
      chat_id as "chatId",
      fact_type as "factType",
      fact_value as "factValue",
      source_message_id as "sourceMessageId",
      confidence,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from user_memory_facts
    where chat_id = ${input.chatId}::uuid
      and is_active = true
      ${input.factTypes?.length ? sql`and fact_type in ${sql(input.factTypes)}` : sql``}
    order by fact_type asc, updated_at desc, id asc
  `;

  return rows.map((row) => ({
    id: row.id,
    chatId: row.chatId,
    factType: row.factType,
    factValue: row.factValue,
    sourceMessageId: row.sourceMessageId,
    confidence: row.confidence,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));
};
