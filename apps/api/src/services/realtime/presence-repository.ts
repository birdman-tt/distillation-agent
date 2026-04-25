import { getSql } from "../../db/client.js";

export const upsertChatRealtimePresence = async (input: {
  sessionId: string;
  chatId: string;
  userId: string | null;
  ttlSeconds?: number;
}) => {
  const sql = getSql();
  const ttlSeconds = input.ttlSeconds ?? 30;
  await sql`
    insert into chat_realtime_presence (
      session_id,
      chat_id,
      user_id,
      last_seen_at,
      expires_at
    ) values (
      ${input.sessionId},
      ${input.chatId}::uuid,
      ${input.userId ?? null}::uuid,
      now(),
      now() + (${ttlSeconds}::text || ' seconds')::interval
    )
    on conflict (session_id) do update
      set chat_id = excluded.chat_id,
          user_id = excluded.user_id,
          last_seen_at = now(),
          expires_at = excluded.expires_at
  `;
};

export const expireChatRealtimePresence = async (sessionId: string) => {
  const sql = getSql();
  await sql`
    update chat_realtime_presence
    set expires_at = now(),
        last_seen_at = now()
    where session_id = ${sessionId}
  `;
};

