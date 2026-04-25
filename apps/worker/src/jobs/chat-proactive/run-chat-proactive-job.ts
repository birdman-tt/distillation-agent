import { randomUUID } from "node:crypto";

import { withTransaction } from "../../db/client.js";

type DueJobRow = {
  id: string;
  chatId: string;
  sourceTurnTraceId: string;
  topic: string;
  reason: string;
  expiresAt: Date;
  createdAt: Date;
};

const buildProactiveContent = (job: DueJobRow) =>
  job.topic.trim()
    ? `刚才这个话题如果你还想聊，我们可以接着往下拆：${job.topic.trim()}。`
    : "刚才的话题如果你还想聊，我们可以接着往下拆。";

const publicMessageFromRow = (row: {
  id: string;
  role: "SYSTEM" | "USER" | "ASSISTANT";
  content: string;
  createdAt: Date;
}) => ({
  id: row.id,
  role: row.role,
  content: row.content,
  basis: null,
  basisSummary: null,
  inferenceLevel: null,
  conflictDetected: null,
  refusalReason: null,
  createdAt: row.createdAt.toISOString(),
});

export const runDueChatProactiveJobs = async (input: { batchSize?: number } = {}) =>
  withTransaction(async (sql) => {
    const jobs = await sql<DueJobRow[]>`
      select
        id,
        chat_id as "chatId",
        source_turn_trace_id as "sourceTurnTraceId",
        topic,
        reason,
        expires_at as "expiresAt",
        created_at as "createdAt"
      from chat_proactive_jobs
      where status = 'PENDING'
        and due_at <= now()
      order by due_at asc
      limit ${input.batchSize ?? 5}
      for update skip locked
    `;

    let sent = 0;
    let cancelled = 0;
    let expired = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        if (job.expiresAt.getTime() <= Date.now()) {
          await sql`
            update chat_proactive_jobs
            set status = 'EXPIRED',
                updated_at = now()
            where id = ${job.id}::uuid
          `;
          expired += 1;
          continue;
        }

        const [presence] = await sql<{ online: boolean }[]>`
          select exists (
            select 1
            from chat_realtime_presence
            where chat_id = ${job.chatId}::uuid
              and expires_at > now()
          ) as online
        `;
        if (!presence?.online) {
          await sql`
            update chat_proactive_jobs
            set status = 'CANCELLED',
                updated_at = now()
            where id = ${job.id}::uuid
          `;
          cancelled += 1;
          continue;
        }

        const [interrupted] = await sql<{ interrupted: boolean }[]>`
          select exists (
            select 1
            from chat_messages
            where chat_id = ${job.chatId}::uuid
              and role = 'USER'
              and created_at > ${job.createdAt}
          ) as interrupted
        `;
        const [cooldown] = await sql<{ active: boolean }[]>`
          select exists (
            select 1
            from chat_proactive_jobs
            where chat_id = ${job.chatId}::uuid
              and status = 'SENT'
              and updated_at > now() - interval '10 minutes'
              and id <> ${job.id}::uuid
          ) as active
        `;
        if (interrupted?.interrupted || cooldown?.active) {
          await sql`
            update chat_proactive_jobs
            set status = 'CANCELLED',
                updated_at = now()
            where id = ${job.id}::uuid
          `;
          cancelled += 1;
          continue;
        }

        await sql`select pg_advisory_xact_lock(hashtext(${job.chatId}))`;
        const [latestTurn] = await sql<{ maxTurnIndex: number | null }[]>`
          select max(turn_index) as "maxTurnIndex"
          from chat_messages
          where chat_id = ${job.chatId}::uuid
        `;
        const messageId = randomUUID();
        const turnIndex = (latestTurn?.maxTurnIndex ?? 0) + 1;
        const [message] = await sql<{
          id: string;
          role: "SYSTEM" | "USER" | "ASSISTANT";
          content: string;
          createdAt: Date;
        }[]>`
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
            ${messageId}::uuid,
            ${job.chatId}::uuid,
            'ASSISTANT',
            ${turnIndex},
            ${buildProactiveContent(job)},
            null,
            null,
            null,
            null,
            null,
            ${sql.json({
              turnTraceId: job.sourceTurnTraceId,
              source: "proactive",
              sequence: 1,
              proactiveJobId: job.id,
            })},
            now()
          )
          returning
            id,
            role,
            content,
            created_at as "createdAt"
        `;

        if (!message) {
          throw new Error("Proactive message insert returned no row");
        }

        await sql`
          update chat_proactive_jobs
          set status = 'SENT',
              updated_at = now()
          where id = ${job.id}::uuid
        `;
        await sql`
          select pg_notify(
            'chat_realtime_events',
            ${JSON.stringify({
              type: "chat.message.created",
              chatId: job.chatId,
              message: publicMessageFromRow(message),
            })}
          )
        `;
        sent += 1;
      } catch {
        await sql`
          update chat_proactive_jobs
          set status = 'FAILED',
              updated_at = now()
          where id = ${job.id}::uuid
        `;
        failed += 1;
      }
    }

    return {
      scanned: jobs.length,
      sent,
      cancelled,
      expired,
      failed,
    };
  });
