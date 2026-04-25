import { randomUUID } from "node:crypto";

import { getSql } from "../client.js";

export type ChatProactiveJobStatus = "PENDING" | "SENT" | "CANCELLED" | "EXPIRED" | "FAILED";

export const clampProactiveDelaySeconds = (delaySeconds: number | null | undefined) =>
  Math.min(Math.max(delaySeconds ?? 180, 180), 600);

export const createChatProactiveJob = async (input: {
  chatId: string;
  sourceTurnTraceId: string;
  topic: string;
  reason: string;
  delaySeconds?: number | null;
}) => {
  const sql = getSql();
  const delaySeconds = clampProactiveDelaySeconds(input.delaySeconds);
  const id = randomUUID();
  const rows = await sql<{
    id: string;
    chatId: string;
    sourceTurnTraceId: string;
    topic: string;
    reason: string;
    dueAt: Date;
    expiresAt: Date;
    status: ChatProactiveJobStatus;
    createdAt: Date;
    updatedAt: Date;
  }[]>`
    insert into chat_proactive_jobs (
      id,
      chat_id,
      source_turn_trace_id,
      topic,
      reason,
      due_at,
      expires_at,
      status
    ) values (
      ${id}::uuid,
      ${input.chatId}::uuid,
      ${input.sourceTurnTraceId},
      ${input.topic},
      ${input.reason},
      now() + (${delaySeconds}::text || ' seconds')::interval,
      now() + (${delaySeconds + 300}::text || ' seconds')::interval,
      'PENDING'
    )
    returning
      id,
      chat_id as "chatId",
      source_turn_trace_id as "sourceTurnTraceId",
      topic,
      reason,
      due_at as "dueAt",
      expires_at as "expiresAt",
      status,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `;

  const row = rows[0];
  if (!row) {
    throw new Error("Unable to create proactive job");
  }

  return {
    ...row,
    dueAt: row.dueAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};
