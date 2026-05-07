import type { z } from "zod";

import { chatMessageMetadataSchema, chatMessageSchema, chatSessionSchema } from "@hall-of-fame/contracts";

import { getSql, withTransaction } from "../client.js";
import { ensureUserShadow } from "./user-shadow-repository.js";

type ChatSession = z.infer<typeof chatSessionSchema>;
type ChatMessage = z.infer<typeof chatMessageSchema>;
type ChatMessageMetadata = z.infer<typeof chatMessageMetadataSchema>;
export type PersistableChatMessage = ChatMessage & {
  messageMetadata?: ChatMessageMetadata;
};
type ChatMessageRole = ChatMessage["role"];

export type PersistedChatMessageRecord = {
  messageId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  turnIndex: number;
  messageMetadata?: ChatMessageMetadata;
};

export type PersistedChatSessionSummaryRecord = {
  chatId: string;
  targetType: ChatSession["targetType"];
  targetPersonaId: string | null;
  targetPersonaVersionId: string;
  ownedObjectId: string | null;
  shareSlug: string | null;
  dynamicDisplayName: string | null;
  latestMessage: string;
  updatedAt: string;
};

export type PersistedChatSessionAccessRecord = {
  chatId: string;
  createdByUserId: string | null;
  targetType: ChatSession["targetType"];
  canAppendMessages: boolean;
};

const mapMessage = (row: {
  id: string;
  role: "SYSTEM" | "USER" | "ASSISTANT";
  content: string;
  basis: Array<{ sourceId: string; snippet: string }> | null;
  basisSummary: { mode: "SUPPORTED" | "INFERRED" | "UNSUPPORTED"; summary: string } | null;
  inferenceLevel: "grounded" | "inferred" | "insufficient_evidence" | null;
  conflictDetected: boolean | null;
  refusalReason:
    | "none"
    | "high_risk"
    | "policy_blocked"
    | "insufficient_evidence"
    | "conflicting_evidence"
    | "out_of_scope"
    | null;
  createdAt: Date;
}) =>
  chatMessageSchema.parse({
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
  });

export const savePersistedChatSession = async (
  session: ChatSession,
  input?: {
    createdByUserId?: string | null;
  },
) => {
  await ensureUserShadow(input?.createdByUserId ?? null);

  await withTransaction(async (sql) => {
    const shareLinkIdRow = session.shareSlug
      ? await sql<{ id: string }[]>`
          select id from share_links where share_slug = ${session.shareSlug} limit 1
        `
      : [];

    await sql`
      insert into chats (
        id,
        target_type,
        target_persona_id,
        target_persona_version_id,
        share_link_id,
        created_by_user_id,
        resolved_from_share,
        created_at
      ) values (
        ${session.id}::uuid,
        ${session.targetType},
        ${session.targetPersonaId ?? null}::uuid,
        ${session.targetPersonaVersionId}::uuid,
        ${shareLinkIdRow[0]?.id ?? null}::uuid,
        ${input?.createdByUserId ?? null}::uuid,
        ${Boolean(session.shareSlug)},
        now()
      )
      on conflict (id) do update
        set target_type = excluded.target_type,
            target_persona_id = excluded.target_persona_id,
            target_persona_version_id = excluded.target_persona_version_id,
            share_link_id = excluded.share_link_id,
            created_by_user_id = coalesce(chats.created_by_user_id, excluded.created_by_user_id),
            resolved_from_share = excluded.resolved_from_share
    `;

    await sql`delete from chat_messages where chat_id = ${session.id}::uuid`;
    for (const [index, message] of session.messages.entries()) {
      await sql`
        insert into chat_messages (
          id,
          chat_id,
          role,
          turn_index,
          content,
          basis,
          basis_summary,
          inference_level,
          conflict_detected,
          refusal_reason,
          message_metadata,
          created_at
        ) values (
          ${message.id}::uuid,
          ${session.id}::uuid,
          ${message.role},
          ${index + 1},
          ${message.content},
          ${message.basis ? sql.json(message.basis) : null},
          ${message.basisSummary ? sql.json(message.basisSummary) : null},
          ${message.inferenceLevel},
          ${message.conflictDetected},
          ${message.refusalReason},
          '{}'::jsonb,
          ${message.createdAt}
        )
      `;
    }
  });

  return getPersistedChatSession(session.id);
};

export const appendPersistedChatMessages = async (chatId: string, messages: PersistableChatMessage[]) => {
  if (!messages.length) {
    return [] as PersistedChatMessageRecord[];
  }

  return await withTransaction(async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtext(${chatId}))`;

    const existingChat = await sql<{ id: string }[]>`
      select id from chats where id = ${chatId}::uuid limit 1
    `;
    if (!existingChat[0]) {
      throw new Error("Chat not found");
    }

    const latestTurn = await sql<{ maxTurnIndex: number | null }[]>`
      select max(turn_index) as "maxTurnIndex"
      from chat_messages
      where chat_id = ${chatId}::uuid
    `;

    let nextTurnIndex = (latestTurn[0]?.maxTurnIndex ?? 0) + 1;
    const persisted: PersistedChatMessageRecord[] = [];

    for (const message of messages) {
      const turnIndex = nextTurnIndex++;
      const messageMetadata = chatMessageMetadataSchema.parse(message.messageMetadata ?? {});
      await sql`
        insert into chat_messages (
          id,
          chat_id,
          role,
          turn_index,
          content,
          basis,
          basis_summary,
          inference_level,
          conflict_detected,
          refusal_reason,
          message_metadata,
          created_at
        ) values (
          ${message.id}::uuid,
          ${chatId}::uuid,
          ${message.role},
          ${turnIndex},
          ${message.content},
          ${message.basis ? sql.json(message.basis) : null},
          ${message.basisSummary ? sql.json(message.basisSummary) : null},
          ${message.inferenceLevel},
          ${message.conflictDetected},
          ${message.refusalReason},
          ${sql.json(messageMetadata)},
          ${message.createdAt}
        )
      `;

      persisted.push({
        messageId: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        turnIndex,
        messageMetadata,
      });
    }

    return persisted;
  });
};

const listPersistedChatMessages = async (input: {
  chatId: string;
  limit: number;
  excludeMessageIds?: string[];
  roles?: ChatMessageRole[];
}) => {
  const sql = getSql();
  const candidateLimit = Math.max(input.limit + (input.excludeMessageIds?.length ?? 0) + 12, input.limit);
  const rows = await sql<{
    id: string;
    role: ChatMessageRole;
    content: string;
    createdAt: Date;
    turnIndex: number | null;
  }[]>`
    select
      id,
      role,
      content,
      created_at as "createdAt",
      turn_index as "turnIndex"
    from chat_messages
    where chat_id = ${input.chatId}::uuid
    order by turn_index desc nulls last, created_at desc, id desc
    limit ${candidateLimit}
  `;

  const excludeIds = new Set(input.excludeMessageIds ?? []);
  const roles = input.roles ? new Set(input.roles) : null;

  return rows
    .filter((row) => !excludeIds.has(row.id))
    .filter((row) => (roles ? roles.has(row.role) : true))
    .slice(0, input.limit)
    .reverse()
    .map((row) => ({
      messageId: row.id,
      role: row.role,
      content: row.content,
      createdAt: new Date(row.createdAt).toISOString(),
      turnIndex: row.turnIndex ?? 0,
    }));
};

export const listPersistedRecentChatMessages = async (input: {
  chatId: string;
  limit: number;
  excludeMessageIds?: string[];
  roles?: ChatMessageRole[];
}) => listPersistedChatMessages(input);

export const listPersistedChatMessagesForSearch = async (input: {
  chatId: string;
  candidateLimit: number;
  excludeMessageIds?: string[];
  roles?: ChatMessageRole[];
}) => listPersistedChatMessages({
  chatId: input.chatId,
  limit: input.candidateLimit,
  excludeMessageIds: input.excludeMessageIds,
  roles: input.roles,
});

export const listPersistedChatSessionSummariesByCreator = async (input: {
  createdByUserId: string;
  limit: number;
}) => {
  const sql = getSql();
  const rows = await sql<{
    chatId: string;
    targetType: ChatSession["targetType"];
    targetPersonaId: string | null;
    targetPersonaVersionId: string;
    ownedObjectId: string | null;
    shareSlug: string | null;
    dynamicDisplayName: string | null;
    latestMessage: string;
    updatedAt: Date;
  }[]>`
    select
      c.id as "chatId",
      c.target_type as "targetType",
      c.target_persona_id as "targetPersonaId",
      c.target_persona_version_id as "targetPersonaVersionId",
      opo.id as "ownedObjectId",
      s.share_slug as "shareSlug",
      p.display_name as "dynamicDisplayName",
      latest.content as "latestMessage",
      latest.created_at as "updatedAt"
    from chats c
    left join share_links s on s.id = c.share_link_id
    left join persona_versions pv on pv.id = c.target_persona_version_id
    left join personae p on p.id = coalesce(c.target_persona_id, pv.persona_id)
    left join owned_persona_objects opo
      on opo.owner_user_id = c.created_by_user_id
     and opo.active_persona_version_id = c.target_persona_version_id
     and opo.deleted_at is null
     and opo.status in ('READY', 'PUBLIC')
    inner join lateral (
      select
        m.content,
        m.created_at
      from chat_messages m
      where m.chat_id = c.id
      order by m.turn_index desc nulls last, m.created_at desc, m.id desc
      limit 1
    ) latest on true
    where c.created_by_user_id = ${input.createdByUserId}::uuid
    order by latest.created_at desc, c.created_at desc, c.id desc
    limit ${input.limit}
  `;

  return rows.map((row) => ({
    ...row,
    updatedAt: new Date(row.updatedAt).toISOString(),
  })) satisfies PersistedChatSessionSummaryRecord[];
};

export const getPersistedChatSession = async (chatId: string) => {
  const sql = getSql();
  const chatRows = await sql<{
    id: string;
    targetType: ChatSession["targetType"];
    targetPersonaId: string | null;
    targetPersonaVersionId: string;
    shareSlug: string | null;
  }[]>`
    select
      c.id,
      c.target_type as "targetType",
      c.target_persona_id as "targetPersonaId",
      c.target_persona_version_id as "targetPersonaVersionId",
      s.share_slug as "shareSlug"
    from chats c
    left join share_links s on s.id = c.share_link_id
    where c.id = ${chatId}::uuid
  `;

  const chat = chatRows[0];
  if (!chat) {
    return null;
  }

  const messageRows = await sql<{
    id: string;
    role: "SYSTEM" | "USER" | "ASSISTANT";
    content: string;
    basis: Array<{ sourceId: string; snippet: string }> | null;
    basisSummary: { mode: "SUPPORTED" | "INFERRED" | "UNSUPPORTED"; summary: string } | null;
    inferenceLevel: "grounded" | "inferred" | "insufficient_evidence" | null;
    conflictDetected: boolean | null;
    refusalReason:
      | "none"
      | "high_risk"
      | "policy_blocked"
      | "insufficient_evidence"
      | "conflicting_evidence"
      | "out_of_scope"
      | null;
    createdAt: Date;
  }[]>`
    select
      id,
      role,
      content,
      basis,
      basis_summary as "basisSummary",
      inference_level as "inferenceLevel",
      conflict_detected as "conflictDetected",
      refusal_reason as "refusalReason",
      created_at as "createdAt"
    from chat_messages
    where chat_id = ${chatId}::uuid
    order by created_at asc
  `;

  return chatSessionSchema.parse({
    ...chat,
    messages: messageRows.map(mapMessage),
  });
};

export const getPersistedChatSessionAccess = async (chatId: string) => {
  const sql = getSql();
  const rows = await sql<PersistedChatSessionAccessRecord[]>`
    select
      c.id as "chatId",
      c.created_by_user_id as "createdByUserId",
      c.target_type as "targetType",
      case
        when c.target_type <> 'draft_version_preview' then true
        else active_object.id is not null
      end as "canAppendMessages"
    from chats c
    left join owned_persona_objects active_object
      on active_object.owner_user_id = c.created_by_user_id
     and active_object.active_persona_version_id = c.target_persona_version_id
     and active_object.deleted_at is null
     and active_object.status in ('READY', 'PUBLIC')
    where c.id = ${chatId}::uuid
    limit 1
  `;

  return rows[0] ?? null;
};
