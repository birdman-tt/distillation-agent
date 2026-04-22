import { getSql } from "../client.js";

export const ensureUserShadow = async (userId: string | null | undefined) => {
  if (!userId) {
    return;
  }

  const sql = getSql();
  await sql`
    insert into users (id, display_name)
    values (${userId}::uuid, null)
    on conflict (id) do nothing
  `;
};
