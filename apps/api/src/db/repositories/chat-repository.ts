import type { z } from "zod";

import { chatMessageSchema, chatSessionSchema } from "@hall-of-fame/contracts";

import { getSql, withTransaction } from "../client.js";

type ChatSession = z.infer<typeof chatSessionSchema>;

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

export const savePersistedChatSession = async (session: ChatSession) => {
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
        null,
        ${Boolean(session.shareSlug)},
        now()
      )
      on conflict (id) do update
        set target_type = excluded.target_type,
            target_persona_id = excluded.target_persona_id,
            target_persona_version_id = excluded.target_persona_version_id,
            share_link_id = excluded.share_link_id,
            resolved_from_share = excluded.resolved_from_share
    `;

    await sql`delete from chat_messages where chat_id = ${session.id}::uuid`;
    for (const message of session.messages) {
      await sql`
        insert into chat_messages (
          id,
          chat_id,
          role,
          content,
          basis,
          basis_summary,
          inference_level,
          conflict_detected,
          refusal_reason,
          created_at
        ) values (
          ${message.id}::uuid,
          ${session.id}::uuid,
          ${message.role},
          ${message.content},
          ${message.basis ? sql.json(message.basis) : null},
          ${message.basisSummary ? sql.json(message.basisSummary) : null},
          ${message.inferenceLevel},
          ${message.conflictDetected},
          ${message.refusalReason},
          ${message.createdAt}
        )
      `;
    }
  });

  return getPersistedChatSession(session.id);
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
