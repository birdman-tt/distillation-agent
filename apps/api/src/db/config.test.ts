import assert from "node:assert/strict";
import test from "node:test";

import { buildDatabaseUrl } from "./config.js";

test("buildDatabaseUrl prefers explicit DATABASE_URL", () => {
  const url = buildDatabaseUrl({
    DATABASE_URL: "postgresql://explicit-user:explicit-pass@example.com:5432/app",
    POSTGRES_PASSWORD: "ignored",
  });

  assert.equal(url, "postgresql://explicit-user:explicit-pass@example.com:5432/app");
});

test("buildDatabaseUrl derives Supabase session pooler url from POSTGRES_PASSWORD when DATABASE_URL is placeholder", () => {
  const url = buildDatabaseUrl({
    DATABASE_URL: "postgresql://hof:hof@localhost:5432/hall_of_fame",
    POSTGRES_PASSWORD: "secret",
  });

  assert.equal(
    url,
    "postgresql://postgres.dibwjojlwwgyxrocaysf:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres",
  );
});

test("buildDatabaseUrl keeps placeholder when no password is available", () => {
  const url = buildDatabaseUrl({
    DATABASE_URL: "postgresql://hof:hof@localhost:5432/hall_of_fame",
  });

  assert.equal(url, "postgresql://hof:hof@localhost:5432/hall_of_fame");
});
